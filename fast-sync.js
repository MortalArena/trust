/**
 * FAST MASS DATA SYNC — Polymarket
 * 
 * Strategy: Instead of fetching per-wallet (slow, rate-limited),
 * we fetch ALL markets from Gamma API, then for each market
 * we fetch its trades ONCE and extract unique wallets.
 * This is 10x faster than fetching per-wallet.
 * 
 * Run: node fast-sync.js
 */

const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const GAMMA = 'https://gamma-api.polymarket.com';
const PAGE_SIZE = 100;
const DELAY_MS = 100; // 100ms between requests

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJSON(url, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const ctl = new AbortController();
      const id = setTimeout(() => ctl.abort(), 15000);
      const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
      clearTimeout(id);
      if (r.status === 429) { await sleep(2000 * (attempt + 1)); continue; }
      if (!r.ok) return null;
      return await r.json();
    } catch {
      if (attempt < retries) await sleep(500);
      else return null;
    }
  }
  return null;
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  FAST MASS SYNC — ALL POLYMARKET DATA');
  console.log('═══════════════════════════════════════════════════\n');

  const [existingTraders, existingTrades] = await Promise.all([
    p.polymarketTrader.count(),
    p.polymarketTrade.count(),
  ]);
  console.log(`DB before: ${existingTraders} traders, ${existingTrades} trades\n`);

  // ══════════════════════════════════════════════════
  // STEP 1: Fetch ALL markets from Gamma API
  // ══════════════════════════════════════════════════
  console.log('Step 1: Fetching ALL active markets...\n');
  
  const allMarkets = [];
  const seenMarketIds = new Set();

  // Fetch markets sorted by volume (most active first)
  for (let page = 0; page < 100; page++) {
    const data = await fetchJSON(`${GAMMA}/markets?limit=${PAGE_SIZE}&active=true&closed=false&order=volume24hr&ascending=false&offset=${page * PAGE_SIZE}`);
    
    if (!data || !Array.isArray(data) || data.length === 0) {
      console.log(`  No more markets at page ${page}`);
      break;
    }

    let newInPage = 0;
    for (const m of data) {
      if (m.id && !seenMarketIds.has(m.id)) {
        seenMarketIds.add(m.id);
        allMarkets.push(m);
        newInPage++;
      }
    }

    if (page % 10 === 0) {
      console.log(`  Markets page ${page}: ${allMarkets.length} total`);
    }

    if (newInPage === 0) break; // No new markets
    await sleep(DELAY_MS);
  }

  console.log(`\nStep 1 complete: ${allMarkets.length} markets found\n`);

  // ══════════════════════════════════════════════════
  // STEP 2: Fetch trades for each market (extract wallets)
  // ══════════════════════════════════════════════════
  console.log('Step 2: Fetching trades to discover wallets...\n');

  const walletSet = new Set();
  const walletData = new Map(); // wallet -> { trades, volume, categories, outcomes }
  let marketsWithTrades = 0;
  let totalTradesFound = 0;

  // Process markets in batches of 50
  const BATCH_SIZE = 50;
  for (let batch = 0; batch < Math.min(allMarkets.length, 500); batch += BATCH_SIZE) {
    const marketBatch = allMarkets.slice(batch, batch + BATCH_SIZE);
    
    await Promise.allSettled(marketBatch.map(async (market) => {
      if (!market.conditionId) return;
      
      // Fetch trades for this market
      const trades = await fetchJSON(
        `${GAMMA}/trades?limit=100&offset=0&order=timestamp&ascending=false&market=${encodeURIComponent(market.id)}`
      );

      if (trades && Array.isArray(trades) && trades.length > 0) {
        marketsWithTrades++;
        totalTradesFound += trades.length;

        for (const t of trades) {
          const wallet = t.proxyWallet || t.user || t.maker?.user || t.taker?.user;
          if (!wallet || !wallet.startsWith('0x')) continue;
          
          const w = wallet.toLowerCase();
          walletSet.add(w);

          if (!walletData.has(w)) {
            walletData.set(w, {
              trades: 0,
              volume: 0,
              categories: new Set(),
              outcomes: { wins: 0, losses: 0, pending: 0 },
              markets: new Set(),
              lastTrade: 0,
              displayName: null,
            });
          }

          const wd = walletData.get(w);
          wd.trades++;
          wd.volume += (t.price || 0) * (t.size || 0);
          wd.markets.add(market.id);
          if (t.timestamp > wd.lastTrade) wd.lastTrade = t.timestamp;

          // Determine category
          const title = (market.question || '').toLowerCase();
          if (title.match(/election|trump|biden|politic|vote|democrat|republican|government|policy|war|geopolit|conflict|russia|ukraine|china|diplomacy|israel|iran/)) wd.categories.add('politics');
          else if (title.match(/btc|bitcoin|eth|crypto|solana|defi|nft|web3|token|coin|blockchain/)) wd.categories.add('crypto');
          else if (title.match(/nfl|nba|soccer|football|sport|game|match|playoff|final|ufc|mma|esports/)) wd.categories.add('sports');
          else if (title.match(/fed|rate|inflation|gdp|stock|market|econom|recession|macro|earnings/)) wd.categories.add('economics');
          else if (title.match(/movie|music|award|oscar|grammy|entertainment|celebrity|film|album/)) wd.categories.add('culture');
          else if (title.match(/ai|tech|space|nasa|science|biotech|innovation|research|robot/)) wd.categories.add('science');
          else if (title.match(/ipo|startup|merger|business|corporate|company|ceo/)) wd.categories.add('business');
          else wd.categories.add('general');

          // Outcome
          if (t.outcomeIndex === 0) wd.outcomes.wins++;
          else if (t.outcomeIndex === 1) wd.outcomes.losses++;
          else wd.outcomes.pending++;
        }
      }
    }));

    const batchNum = Math.floor(batch / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(Math.min(allMarkets.length, 500) / BATCH_SIZE);
    console.log(`  Batch ${batchNum}/${totalBatches}: ${walletSet.size} unique wallets, ${totalTradesFound} trades from ${marketsWithTrades} markets`);
    
    await sleep(DELAY_MS * 2);
  }

  console.log(`\nStep 2 complete: ${walletSet.size} unique wallets from ${totalTradesFound} trades\n`);

  // ══════════════════════════════════════════════════
  // STEP 3: Upsert traders into DB
  // ══════════════════════════════════════════════════
  console.log('Step 3: Saving traders to DB...\n');

  const walletArray = Array.from(walletSet);
  let saved = 0;

  // Process in batches of 100
  for (let i = 0; i < walletArray.length; i += 100) {
    const batch = walletArray.slice(i, i + 100);
    
    await Promise.allSettled(batch.map(async (wallet) => {
      const wd = walletData.get(wallet);
      if (!wd || wd.trades === 0) return;

      const totalOutcomes = wd.outcomes.wins + wd.outcomes.losses;
      const winRate = totalOutcomes > 0 ? (wd.outcomes.wins / totalOutcomes) * 100 : 0;
      const avgTradeSize = wd.trades > 0 ? wd.volume / wd.trades : 0;
      const roi = wd.volume > 0 ? ((wd.outcomes.wins - wd.outcomes.losses) / wd.volume) * 100 : 0;
      const activityDays = wd.lastTrade > 0 ? Math.max(1, Math.round((Date.now() / 1000 - wd.lastTrade) / 86400)) : 1;
      const uniqueMarkets = wd.markets.size;

      // Determine risk level
      const riskLevel = Math.abs(roi) > 50 ? 'HIGH' : Math.abs(roi) > 20 ? 'MEDIUM' : 'LOW';

      // Calculate V2 scores from aggregated data
      const forecastBrier = totalOutcomes > 0 ? totalOutcomes * 0.15 : 0.25;
      const forecastLogLoss = totalOutcomes > 0 ? Math.log(1 + totalOutcomes) * 0.1 : 0.693;
      const forecastCalibration = totalOutcomes > 0 ? Math.max(0, 100 - Math.abs(winRate - 50) * 2) : 50;
      const predictiveScore = totalOutcomes > 0 
        ? Math.max(0, Math.min(100, (0.25 - forecastBrier) / 0.25 * 40 + (0.693 - forecastLogLoss) / 0.693 * 30 + forecastCalibration * 0.3))
        : 0;
      const alphaScore = Math.max(0, Math.min(100, 50 + roi * 2));
      const confidenceMultiplier = 1 - Math.exp(-wd.trades / 150);
      const confidenceScore = confidenceMultiplier * 100;
      const behaviorScore = Math.max(0, Math.min(100, 50 + (winRate - 50) * 0.5));
      const riskScore = Math.max(0, Math.min(100, 100 - Math.abs(roi)));
      const masterPMI = Math.max(0, Math.min(100,
        predictiveScore * 0.30 + alphaScore * 0.25 + riskScore * 0.20 + behaviorScore * 0.15 + confidenceScore * 0.10
      ));

      await p.polymarketTrader.upsert({
        where: { proxyWallet: wallet },
        update: {
          totalTrades: wd.trades,
          winRate,
          roi: Math.round(roi * 100) / 100,
          consistency: Math.round(behaviorScore * 100) / 100,
          profitFactor: wd.outcomes.losses > 0 ? wd.outcomes.wins / wd.outcomes.losses : wd.outcomes.wins || 0,
          riskLevel,
          totalVolumeUsd: Math.round(wd.volume * 100) / 100,
          avgTradeSize: Math.round(avgTradeSize * 100) / 100,
          activityDays,
          categories: [...wd.categories],
          lastSyncedAt: new Date(),
          predictiveScore: Math.round(predictiveScore * 10) / 10,
          alphaScore: Math.round(alphaScore * 10) / 10,
          behaviorScore: Math.round(behaviorScore * 10) / 10,
          confidenceScore: Math.round(confidenceScore * 10) / 10,
          riskScore: Math.round(riskScore * 10) / 10,
          masterPMI: Math.round(masterPMI * 10) / 10,
          edgeScore: Math.round((roi * 0.4 + winRate * 0.3 + Math.min(wd.trades, 500) * 0.2 + Math.min(uniqueMarkets, 50) * 0.1) * 10) / 10,
          trustScore: Math.round((winRate * 0.3 + behaviorScore * 0.25 + confidenceScore * 0.2 + (100 - Math.abs(roi)) * 0.15 + Math.min(activityDays, 100) * 0.1) * 10) / 10,
          maxDrawdown: Math.min(50, Math.abs(Math.min(0, roi))),
          timingScore: Math.round((50 + roi * 0.5) * 10) / 10,
        },
        create: {
          proxyWallet: wallet,
          totalTrades: wd.trades,
          winRate,
          roi: Math.round(roi * 100) / 100,
          consistency: Math.round(behaviorScore * 100) / 100,
          profitFactor: wd.outcomes.losses > 0 ? wd.outcomes.wins / wd.outcomes.losses : wd.outcomes.wins || 0,
          riskLevel,
          totalVolumeUsd: Math.round(wd.volume * 100) / 100,
          avgTradeSize: Math.round(avgTradeSize * 100) / 100,
          activityDays,
          categories: [...wd.categories],
          lastSyncedAt: new Date(),
          predictiveScore: Math.round(predictiveScore * 10) / 10,
          alphaScore: Math.round(alphaScore * 10) / 10,
          behaviorScore: Math.round(behaviorScore * 10) / 10,
          confidenceScore: Math.round(confidenceScore * 10) / 10,
          riskScore: Math.round(riskScore * 10) / 10,
          masterPMI: Math.round(masterPMI * 10) / 10,
          edgeScore: Math.round((roi * 0.4 + winRate * 0.3 + Math.min(wd.trades, 500) * 0.2 + Math.min(uniqueMarkets, 50) * 0.1) * 10) / 10,
          trustScore: Math.round((winRate * 0.3 + behaviorScore * 0.25 + confidenceScore * 0.2 + (100 - Math.abs(roi)) * 0.15 + Math.min(activityDays, 100) * 0.1) * 10) / 10,
          maxDrawdown: Math.min(50, Math.abs(Math.min(0, roi))),
          timingScore: Math.round((50 + roi * 0.5) * 10) / 10,
        },
      });

      saved++;
    }));

    if ((i + 100) % 500 === 0 || i + 100 >= walletArray.length) {
      console.log(`  Saved: ${saved}/${walletArray.length} traders`);
    }
  }

  // ══════════════════════════════════════════════════
  // FINAL STATS
  // ══════════════════════════════════════════════════
  const [finalTraders, finalTrades, v2Count] = await Promise.all([
    p.polymarketTrader.count(),
    p.polymarketTrade.count(),
    p.polymarketTrader.count({ where: { masterPMI: { gt: 0 } } }),
  ]);

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  FINAL RESULTS');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Markets scanned:    ${allMarkets.length}`);
  console.log(`  Wallets discovered: ${walletSet.size}`);
  console.log(`  Traders saved:      ${saved}`);
  console.log(`  Total traders in DB: ${finalTraders}`);
  console.log(`  V2 scored:          ${v2Count}`);
  console.log(`  Total trades in DB: ${finalTrades}`);
  console.log('═══════════════════════════════════════════════════\n');

  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
