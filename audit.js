const { PrismaClient } = require('@prisma/client');
const https = require('https');
const http = require('http');
const fs = require('fs');

const p = new PrismaClient();

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { Accept: 'application/json' }, timeout: 20000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, data: null, raw: data.substring(0, 200) }); }
      });
    });
    req.on('error', (e) => resolve({ status: 0, error: e.message, data: null }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, error: 'timeout', data: null }); });
  });
}

async function main() {
  console.log('=== FULL AUDIT ===\n');

  // 1. How many traders total?
  const total = await p.polymarketTrader.count();
  const withScores = await p.polymarketTrader.count({ where: { trustScore: { gt: 0 } } });
  const withTrades = await p.polymarketTrader.count({ where: { totalTrades: { gt: 0 } } });
  const withZeroTrades = await p.polymarketTrader.count({ where: { totalTrades: 0 } });

  console.log('DB STATUS:');
  console.log('  Total traders:', total);
  console.log('  With trustScore > 0:', withScores);
  console.log('  With totalTrades > 0:', withTrades);
  console.log('  With totalTrades = 0 (not synced):', withZeroTrades);

  // 2. Sample 5 random synced traders and verify their data
  console.log('\n=== SAMPLE 5 SYNCED TRADERS (verification) ===');
  const sample = await p.polymarketTrader.findMany({
    where: { trustScore: { gt: 0 }, totalTrades: { gt: 0 } },
    take: 5,
    orderBy: { trustScore: 'desc' }
  });

  for (const t of sample) {
    console.log('\n--- ' + t.proxyWallet + ' ---');
    console.log('  displayName:', t.displayName);
    console.log('  pseudonym:', t.pseudonym);
    console.log('  trustScore:', Number(t.trustScore));
    console.log('  edgeScore:', Number(t.edgeScore));
    console.log('  totalTrades:', t.totalTrades);
    console.log('  roi:', Number(t.roi) + '%');
    console.log('  winRate:', Number(t.winRate) + '%');
    console.log('  consistency:', Number(t.consistency) + '%');
    console.log('  profitFactor:', Number(t.profitFactor));
    console.log('  maxDrawdown:', Number(t.maxDrawdown) + '%');
    console.log('  riskLevel:', t.riskLevel);
    console.log('  avgTradeSize:', '$' + Number(t.avgTradeSize).toLocaleString());
    console.log('  totalVolumeUsd:', '$' + Number(t.totalVolumeUsd).toLocaleString());
    console.log('  timingScore:', Number(t.timingScore));
    console.log('  activityDays:', t.activityDays);
    console.log('  categories:', t.categories);
    console.log('  lastSyncedAt:', t.lastSyncedAt.toISOString());

    // Verify: fetch live data from Polymarket for this wallet
    console.log('  [VERIFY] Fetching live data from Polymarket API...');
    const tradesRes = await fetchJSON('https://data-api.polymarket.com/trades?user=' + t.proxyWallet + '&limit=5&offset=0');
    console.log('  [VERIFY] API status:', tradesRes.status, '| trades returned:', tradesRes.data ? tradesRes.data.length : 0);
    if (tradesRes.data && tradesRes.data.length > 0) {
      const sample = tradesRes.data[0];
      console.log('  [VERIFY] Sample trade:', JSON.stringify(sample).substring(0, 200));
    }
  }

  // 3. How many traders have truly complete data?
  console.log('\n=== DATA COMPLETENESS ===');
  const allSynced = await p.polymarketTrader.findMany({
    where: { trustScore: { gt: 0 } },
    select: {
      proxyWallet: true, trustScore: true, edgeScore: true, totalTrades: true,
      winRate: true, roi: true, consistency: true, profitFactor: true,
      maxDrawdown: true, avgTradeSize: true, totalVolumeUsd: true,
      timingScore: true, activityDays: true, categories: true,
      displayName: true, pseudonym: true, verifiedBadge: true, xUsername: true,
    }
  });

  let complete = 0, missing = 0;
  const missingList = [];
  for (const t of allSynced) {
    const issues = [];
    if (!t.displayName && !t.pseudonym) issues.push('no name');
    if (Number(t.winRate) === 0 && t.totalTrades > 10) issues.push('0 winRate');
    if (Number(t.consistency) === 50 && t.totalTrades > 5) issues.push('50 consistency (default)');
    if (Number(t.roi) === 0 && t.totalTrades > 10) issues.push('0 roi');
    if (!t.categories || t.categories.length === 0) issues.push('no category');
    if (Number(t.profitFactor) === 0) issues.push('0 profitFactor');
    if (issues.length > 0) {
      missing++;
      missingList.push({ w: t.proxyWallet.substring(0, 10), trades: t.totalTrades, issues: issues.join(', ') });
    } else {
      complete++;
    }
  }

  console.log('Synced traders:', allSynced.length);
  console.log('Complete data:', complete);
  console.log('Missing/partial data:', missing);

  if (missingList.length > 0) {
    console.log('\n=== TRADERS WITH MISSING DATA (first 20) ===');
    missingList.slice(0, 20).forEach(function(m) {
      console.log('  ' + m.w + '... | trades: ' + m.trades + ' | issues: ' + m.issues);
    });
  }

  // 4. Check recently synced traders' lastSyncedAt
  console.log('\=== SYNC TIMELINE ===');
  const oldestSync = await p.polymarketTrader.findFirst({ where: { trustScore: { gt: 0 } }, orderBy: { lastSyncedAt: 'asc' }, select: { proxyWallet: true, lastSyncedAt: true } });
  const newestSync = await p.polymarketTrader.findFirst({ where: { trustScore: { gt: 0 } }, orderBy: { lastSyncedAt: 'desc' }, select: { proxyWallet: true, lastSyncedAt: true } });
  console.log('Oldest sync:', oldestSync ? oldestSync.lastSyncedAt.toISOString() : 'N/A');
  console.log('Newest sync:', newestSync ? newestSync.lastSyncedAt.toISOString() : 'N/A');

  await p.$disconnect();
}

main().catch(function(e) { console.error('FATAL:', e); process.exit(1); });
