/**
 * Populate traders discovered by smart-sync
 * Takes pending wallets from recent market scans and syncs them
 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const DATA = 'https://data-api.polymarket.com';
const DELAY = 300;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetch(url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const ctl = new AbortController();
      const id = setTimeout(() => ctl.abort(), 15000);
      const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
      clearTimeout(id);
      if (r.status === 429) { await sleep(5000 * (attempt + 1)); continue; }
      if (!r.ok) return null;
      return await r.json();
    } catch {
      if (attempt < 4) await sleep(1000);
      else return null;
    }
  }
  return null;
}

async function main() {
  // Find traders with 0 trades that need syncing
  const pending = await p.polymarketTrader.findMany({
    where: { totalTrades: 0 },
    take: 100,
    orderBy: { createdAt: 'desc' },
  });

  console.log(`Found ${pending.length} traders with 0 trades to sync\n`);

  let synced = 0;
  let totalTrades = 0;

  for (const trader of pending) {
    const wallet = trader.proxyWallet;

    try {
      // Fetch ALL trades for this wallet
      const allTrades = [];
      for (let page = 0; page < 100; page++) {
        const data = await fetch(`${DATA}/trades?limit=100&offset=${page * 100}&user=${wallet}&order=timestamp&ascending=false`);
        if (!data || data.length === 0) break;
        allTrades.push(...data);
        if (data.length < 100) break;
        await sleep(100);
      }

      if (allTrades.length === 0) continue;

      // Determine categories
      const cats = new Set();
      for (const t of allTrades) {
        const title = (t.title || '').toLowerCase();
        if (title.match(/election|trump|biden|politic|vote|democrat|republican|government|policy/)) cats.add('politics');
        else if (title.match(/btc|bitcoin|eth|crypto|solana|defi|nft|web3|token|coin/)) cats.add('crypto');
        else if (title.match(/nfl|nba|soccer|football|sport|game|match|playoff|final|ufc|mma/)) cats.add('sports');
        else if (title.match(/fed|rate|inflation|gdp|stock|market|econom|recession|macro/)) cats.add('economics');
        else if (title.match(/movie|music|award|oscar|grammy|entertainment|celebrity|film/)) cats.add('culture');
        else if (title.match(/war|geopolit|conflict|russia|ukraine|china|diplomacy|israel|iran/)) cats.add('politics');
        else if (title.match(/ai|tech|space|nasa|science|biotech|innovation|research/)) cats.add('science');
        else if (title.match(/ipo|startup|merger|earning|business|corporate|company/)) cats.add('business');
      }
      const categories = cats.size > 0 ? Array.from(cats) : ['general'];

      // Save trades
      let saved = 0;
      const tradeData = allTrades.map(t => ({
        traderId: trader.id,
        marketId: t.conditionId || `unk-${t.timestamp}`,
        conditionId: t.conditionId || '',
        marketTitle: t.title || null,
        category: categories[0] || 'general',
        side: (t.side || 'BUY').toUpperCase(),
        outcome: t.outcomeIndex === 1 ? 'NO' : 'YES',
        price: t.price || 0,
        shares: t.size || 0,
        valueUsd: Math.round((t.price || 0) * (t.size || 0) * 100) / 100,
        feeUsd: null,
        entryProbability: t.price || null,
        timestamp: new Date(t.timestamp * 1000),
      }));

      for (let b = 0; b < tradeData.length; b += 100) {
        try {
          const res = await p.polymarketTrade.createMany({ data: tradeData.slice(b, b + 100), skipDuplicates: true });
          saved += res.count;
        } catch {}
      }

      // Update stats
      const wins = allTrades.filter(t => t.outcomeIndex === 0).length;
      const consistency = Math.max(10, Math.min(50, 50 - (allTrades.reduce((sum, t, i) => sum + (i > 0 ? Math.abs(t.price - allTrades[i-1].price) : 0), 0) / allTrades.length) * 10));

      const now = new Date();
      const activityDays = Math.max(1, Math.round((now.getTime() - new Date(allTrades[allTrades.length-1].timestamp * 1000).getTime()) / (24 * 3600 * 1000)));
      const totalVolume = allTrades.reduce((s, t) => s + (t.price * t.size), 0);
      const avgTradeSize = totalVolume / allTrades.length;
      const pnl = allTrades.filter(t => t.outcomeIndex === 0).reduce((s, t) => s + t.price * t.size, 0) - allTrades.filter(t => t.outcomeIndex === 1).reduce((s, t) => s + t.price * t.size, 0);
      const roi = totalVolume > 0 ? (pnl / totalVolume) * 100 : 0;
      const pf = allTrades.filter(t => t.outcomeIndex === 1).length > 0 ?
        allTrades.filter(t => t.outcomeIndex === 0).reduce((s, t) => s + t.price * t.size, 0) /
        Math.max(1, allTrades.filter(t => t.outcomeIndex === 1).reduce((s, t) => s + t.price * t.size, 0)) : 0;

      await p.polymarketTrader.update({
        where: { id: trader.id },
        data: {
          totalTrades: allTrades.length,
          winRate: allTrades.length > 0 ? (wins / allTrades.length) * 100 : 0,
          roi,
          consistency,
          profitFactor: pf,
          totalVolumeUsd: totalVolume,
          avgTradeSize,
          activityDays,
          maxDrawdown: Math.min(50, Math.abs(Math.min(0, roi)) / 2),
          riskLevel: Math.abs(roi) > 50 ? 'HIGH' : Math.abs(roi) > 20 ? 'MEDIUM' : 'LOW',
          lastSyncedAt: now,
        },
      });

      synced++;
      totalTrades += saved;

      if (synced % 10 === 0) console.log(`  [${synced}/${pending.length}] Synced | Trades: ${totalTrades}`);

      await sleep(DELAY);
    } catch (e) {
      console.error(`  Error ${wallet.slice(0, 12)}:`, e.message);
    }
  }

  const [finalTraders, finalTrades, finalV2] = await Promise.all([
    p.polymarketTrader.count(),
    p.polymarketTrade.count(),
    p.polymarketTrader.count({ where: { masterPMI: { gt: 0 } } }),
  ]);

  console.log(`\nDone! Synced: ${synced} | Trades: ${totalTrades}`);
  console.log(`DB: ${finalTraders} traders, ${finalTrades} trades, ${finalV2} V2 scored`);

  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
