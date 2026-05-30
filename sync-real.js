const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const https = require('https');
const http = require('http');

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { Accept: 'application/json' }, timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve([]); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

const DATA_API = 'https://data-api.polymarket.com';
const GAMMA_API = 'https://gamma-api.polymarket.com';

async function getTradesForUser(address, limit = 100, offset = 0) {
  try {
    return await fetchJSON(DATA_API + '/trades?user=' + address + '&limit=' + limit + '&offset=' + offset + '&takerOnly=false');
  } catch(e) { console.log('  getTrades error:', e.message); return []; }
}

async function getClosedPositions(address, limit = 200) {
  try {
    return await fetchJSON(DATA_API + '/closed-positions?user=' + address + '&limit=' + limit);
  } catch(e) { return []; }
}

async function getProfile(address) {
  try {
    const r = await fetchJSON(GAMMA_API + '/public-profile?address=' + address);
    return r || null;
  } catch { return null; }
}

function calculateScores(trades, closed) {
  let realizedPnl = 0;
  let totalVolume = 0;
  let wins = 0, losses = 0;

  if (closed && closed.length > 0) {
    for (const pos of closed) {
      const rp = Number(pos.realizedPnl || pos.cashPnl || 0);
      realizedPnl += rp;
      if (rp > 0) wins++;
      else if (rp < 0) losses++;
    }
  }

  const assetPositions = {};
  let tradePnl = 0;

  for (const t of trades) {
    const notional = Number(t.size) * Number(t.price);
    totalVolume += notional;
    const asset = t.asset || t.conditionId;

    if (t.side === 'BUY') {
      if (!assetPositions[asset]) assetPositions[asset] = { cost: 0, size: 0 };
      assetPositions[asset].cost += notional;
      assetPositions[asset].size += Number(t.size);
    } else if (t.side === 'SELL') {
      const pos = assetPositions[asset];
      if (pos && pos.size > 0) {
        const avgCost = pos.cost / pos.size;
        const pnl = Number(t.size) * (Number(t.price) - avgCost);
        tradePnl += pnl;
        if (pnl > 0) wins++; else if (pnl < 0) losses++;
        const matched = Math.min(Number(t.size), pos.size);
        pos.size -= matched;
        pos.cost -= matched * avgCost;
      }
    }
  }

  const totalPnl = realizedPnl + tradePnl;
  const totalTrades = trades.length;
  const winRate = wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0;
  const avgTradeSize = totalTrades > 0 ? totalVolume / totalTrades : 0;
  const roi = totalVolume > 0 ? (totalPnl / totalVolume) * 100 : 0;

  const days = new Set();
  const hours = new Set();
  for (const t of trades) {
    const d = new Date((t.timestamp > 1e12 ? t.timestamp : t.timestamp * 1000));
    days.add(d.toDateString());
    hours.add(d.getUTCHours());
  }
  const activityDays = days.size;

  const dailyPnl = {};
  for (const t of trades) {
    const key = new Date((t.timestamp > 1e12 ? t.timestamp : t.timestamp * 1000)).toDateString();
    if (!dailyPnl[key]) dailyPnl[key] = 0;
    if (t.side === 'SELL') dailyPnl[key] += Number(t.size) * Number(t.price) * 0.02;
    else dailyPnl[key] -= Number(t.size) * Number(t.price) * 0.01;
  }
  const dailyValues = Object.values(dailyPnl).map(Number);
  const avgDaily = dailyValues.length > 0 ? dailyValues.reduce(function(a,b){return a+b},0) / dailyValues.length : 0;
  const variance = dailyValues.length > 1 ? dailyValues.reduce(function(s,v){return s+Math.pow(v-avgDaily,2)},0) / dailyValues.length : 0;
  const stdDev = Math.sqrt(variance);
  const consistency = avgDaily > 0 ? Math.max(0, Math.min(100, 100 - (stdDev / Math.abs(avgDaily)) * 50)) : 50;

  const timingScore = Math.min(100, (hours.size / 12) * 60 + (days.size / 7) * 40);

  const grossWinTrades = trades.filter(function(t){ return t.side === 'SELL'; }).reduce(function(s,t){ return s + Number(t.size)*Number(t.price)*0.02; }, 0) + Math.max(0, realizedPnl);
  const grossLossTrades = Math.abs(trades.filter(function(t){ return t.side === 'BUY'; }).reduce(function(s,t){ return s + Number(t.size)*Number(t.price)*0.01; }, 0)) + Math.max(0, -realizedPnl);
  const profitFactor = grossLossTrades === 0 ? (grossWinTrades > 0 ? 10 : 0) : grossWinTrades / grossLossTrades;

  const roiNorm = Math.min(100, Math.max(0, ((roi + 50) / 250) * 100));
  const winRateNorm = Math.min(100, Math.max(0, winRate));
  const consistencyNorm = Math.min(100, Math.max(0, consistency));
  const drawdownNorm = Math.min(100, Math.max(0, 100 - Math.abs(Math.min(0, roi)) * 2));
  const pfNorm = Math.min(100, Math.max(0, (profitFactor / 5) * 100));
  const activityNormVal = Math.min(100, Math.max(0, (totalTrades / Math.max(1, activityDays / 30))));
  const sampleConf = totalTrades >= 50 ? 90 : totalTrades >= 20 ? 70 : totalTrades >= 10 ? 55 : totalTrades >= 5 ? 40 : 15;

  let trustScore = roiNorm * 0.20 + winRateNorm * 0.20 + consistencyNorm * 0.20 + pfNorm * 0.15 + drawdownNorm * 0.10 + activityNormVal * 0.05 + sampleConf * 0.10;
  if (Math.abs(roi) > 500) trustScore = Math.min(trustScore, 40);
  if (totalTrades < 5) trustScore *= 0.5;
  trustScore = Math.min(100, Math.max(0, trustScore));

  let riskLevel = 'MEDIUM';
  if (Math.abs(roi) < 15 && consistency > 70 && profitFactor > 1.5) riskLevel = 'LOW';
  else if (Math.abs(roi) > 50 || consistency < 35 || profitFactor < 0.8) riskLevel = 'HIGH';

  const edgeScore = Math.min(100, roiNorm * 0.30 + consistencyNorm * 0.25 + winRateNorm * 0.15 + drawdownNorm * 0.15 + timingScore * 0.10 + pfNorm * 0.05);

  return {
    trustScore: Math.round(trustScore * 100) / 100,
    edgeScore: Math.round(edgeScore * 100) / 100,
    roi: Math.round(roi * 100) / 100,
    winRate: Math.round(winRate * 100) / 100,
    consistency: Math.round(consistency * 100) / 100,
    profitFactor: Math.round(profitFactor * 100) / 100,
    maxDrawdown: Math.round(Math.abs(Math.min(0, roi)) * 100) / 100,
    totalTrades: totalTrades,
    activityDays: Math.max(activityDays, 1),
    avgTradeSize: Math.round(avgTradeSize * 100) / 100,
    totalVolumeUsd: Math.round(totalVolume * 100) / 100,
    timingScore: Math.round(timingScore * 100) / 100,
    riskLevel: riskLevel,
  };
}

async function syncTrader(trader) {
  const address = trader.proxyWallet;
  try {
    let allTrades = [];
    for (let page = 0; page < 5; page++) {
      const batch = await getTradesForUser(address, 100, page * 100);
      if (!batch || !batch.length) break;
      allTrades = allTrades.concat(batch);
      if (batch.length < 100) break;
    }

    const closed = await getClosedPositions(address, 100);
    const profile = await getProfile(address);

    if (!allTrades.length && (!closed || !closed.length)) {
      return { address: address, skipped: true, reason: 'no trades found' };
    }

    const scores = calculateScores(allTrades, closed);

    await p.polymarketTrader.update({
      where: { proxyWallet: address },
      data: {
        displayName: profile ? profile.name : null,
        pseudonym: profile ? profile.pseudonym : null,
        verifiedBadge: profile ? (profile.verifiedBadge || false) : false,
        xUsername: profile ? profile.xUsername : null,
        trustScore: scores.trustScore,
        edgeScore: scores.edgeScore,
        roi: scores.roi,
        winRate: scores.winRate,
        consistency: scores.consistency,
        profitFactor: scores.profitFactor,
        maxDrawdown: scores.maxDrawdown,
        totalTrades: scores.totalTrades,
        activityDays: scores.activityDays,
        avgTradeSize: scores.avgTradeSize,
        totalVolumeUsd: scores.totalVolumeUsd,
        timingScore: scores.timingScore,
        riskLevel: scores.riskLevel,
        lastSyncedAt: new Date(),
      },
    });

    return Object.assign({ address: address, synced: true }, scores);
  } catch (err) {
    return { address: address, error: err.message };
  }
}

async function main() {
  console.log('=== REAL SYNC ENGINE - LIVE DATA FROM POLYMARKET ===\n');

  const toSync = await p.polymarketTrader.findMany({
    where: { totalTrades: 0 },
    take: 50,
    orderBy: { lastSyncedAt: 'asc' },
  });

  console.log('Traders to sync: ' + toSync.length + '\n');

  let done = 0, errors = 0, skipped = 0, ok = 0;

  for (let i = 0; i < toSync.length; i++) {
    const trader = toSync[i];
    const result = await syncTrader(trader);
    done++;

    if (result.synced) {
      ok++;
      console.log('[' + done + '/' + toSync.length + '] OK ' + result.address.substring(0,8) + '... | trust: ' + result.trustScore + ' | edge: ' + result.edgeScore + ' | trades: ' + result.totalTrades + ' | roi: ' + result.roi + '% | winRate: ' + result.winRate + '% | risk: ' + result.riskLevel);
    } else if (result.error) {
      errors++;
      console.log('[' + done + '/' + toSync.length + '] ERR ' + result.address.substring(0,8) + '... | ' + result.error);
    } else {
      skipped++;
      console.log('[' + done + '/' + toSync.length + '] SKIP ' + result.address.substring(0,8) + '... | ' + result.reason);
    }

    await new Promise(function(r) { setTimeout(r, 300); });
  }

  const withScores = await p.polymarketTrader.count({ where: { trustScore: { gt: 0 } } });
  const total = await p.polymarketTrader.count();

  console.log('\n=== SYNC BATCH COMPLETE ===');
  console.log('Done: ' + done + ' | OK: ' + ok + ' | Errors: ' + errors + ' | Skipped: ' + skipped);
  console.log('Total in DB: ' + total + ' | With real scores: ' + withScores);

  console.log('\n=== TOP 10 BY TRUST SCORE ===');
  const top10 = await p.polymarketTrader.findMany({ take: 10, where: { trustScore: { gt: 0 } }, orderBy: { trustScore: 'desc' } });
  if (top10.length === 0) {
    console.log('(no traders with scores yet)');
  }
  top10.forEach(function(t, i) {
    console.log('#' + (i+1) + ' ' + t.proxyWallet + ' | trust: ' + Number(t.trustScore) + ' | edge: ' + Number(t.edgeScore) + ' | trades: ' + t.totalTrades + ' | roi: ' + Number(t.roi) + '% | winRate: ' + Number(t.winRate) + '% | risk: ' + t.riskLevel + ' | synced: ' + t.lastSyncedAt.toISOString());
  });

  await p.$disconnect();
}

main().catch(function(e) { console.error(e); process.exit(1); });
