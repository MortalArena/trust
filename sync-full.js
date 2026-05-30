const { PrismaClient } = require('@prisma/client');
const https = require('https');
const http = require('http');
const fs = require('fs');

const p = new PrismaClient();
let totalProcessed = 0;
let totalSynced = 0;
let totalSkipped = 0;
const startTime = Date.now();

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { Accept: 'application/json' }, timeout: 20000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, data: null, raw: data.substring(0,300) }); }
      });
    });
    req.on('error', (e) => resolve({ status: 0, error: e.message, data: null }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, error: 'timeout', data: null }); });
  });
}

async function getTrades(address, limit, offset) {
  try {
    return await fetchJSON('https://data-api.polymarket.com/trades?user=' + address + '&limit=' + limit + '&offset=' + offset + '&takerOnly=false');
  } catch { return { status: 0, data: [] }; }
}
async function getClosed(address, limit) {
  try { return await fetchJSON('https://data-api.polymarket.com/closed-positions?user=' + address + '&limit=' + limit); }
  catch { return { status: 0, data: [] }; }
}
async function getActivePositions(address, limit) {
  try { return await fetchJSON('https://data-api.polymarket.com/positions?user=' + address + '&limit=' + limit); }
  catch { return { status: 0, data: [] }; }
}
async function getProfile(address) {
  try {
    const r = await fetchJSON('https://gamma-api.polymarket.com/public-profile?address=' + address);
    return (r && r.data) ? r.data : null;
  } catch { return null; }
}

function calculateAllScores(trades, closedPositions) {
  if (!trades || trades.length === 0) return null;

  // ===== REAL PNL CALCULATION =====
  // Track positions per asset using FIFO matching
  const positionQueue = {}; // asset -> [{size, price, timestamp}]
  let totalRealizedPnl = 0;
  let totalBuyCost = 0;
  let totalSellProceeds = 0;
  let totalVolume = 0;
  let tradeCount = trades.length;

  for (const t of trades) {
    const size = Number(t.size);
    const price = Number(t.price);
    const notional = size * price;
    totalVolume += notional;
    const asset = t.asset || t.conditionId;

    if (t.side === 'BUY') {
      if (!positionQueue[asset]) positionQueue[asset] = [];
      positionQueue[asset].push({ size, price, timestamp: t.timestamp });
      totalBuyCost += notional;
    } else if (t.side === 'SELL') {
      totalSellProceeds += notional;
      // Match against earliest FIFO buys
      let remainingSell = size;
      const queue = positionQueue[asset] || [];
      while (remainingSell > 0.0001 && queue.length > 0) {
        const head = queue[0];
        const matched = Math.min(remainingSell, head.size);
        // Realized PnL on this matched chunk
        totalRealizedPnl += matched * (price - head.price);
        head.size -= matched;
        remainingSell -= matched;
        if (head.size < 0.0001) queue.shift();
      }
      // Unmatched sell (short): estimate cost basis at sell price
      if (remainingSell > 0.0001) {
        // No prior buy — cost basis unknown, assume break-even
      }
    }
  }

  // Add realized PnL from closed positions API (verified data)
  let closedPnl = 0;
  let closedWins = 0;
  let closedLosses = 0;
  if (closedPositions && closedPositions.length > 0) {
    for (const pos of closedPositions) {
      const rp = Number(pos.realizedPnl || 0);
      if (!isNaN(rp) && rp !== 0) {
        closedPnl += rp;
        if (rp > 0) closedWins++;
        else closedLosses++;
      }
    }
    if (closedPnl !== 0) totalRealizedPnl = closedPnl; // Override with verified data
  }

  // ===== TRADE-LEVEL STATS =====
  let grossProfit = 0;
  let grossLoss = 0;
  let wins = 0;
  let losses = 0;

  for (const t of trades) {
    const size = Number(t.size);
    const price = Number(t.price);
    const asset = t.asset || t.conditionId;
    const queue = positionQueue[asset];

    if (t.side === 'SELL' && queue && queue.length > 0) {
      const avgCost = queue.reduce(function(s, q) { return s + q.price * q.size; }, 0) /
                      queue.reduce(function(s, q) { return s + q.size; }, 0);
      const pnl = size * (price - avgCost);
      if (pnl > 0) { grossProfit += pnl; wins++; }
      else if (pnl < 0) { grossLoss += Math.abs(pnl); losses++; }
    }
  }

  // Add closed positions to win/loss counts
  wins += closedWins;
  losses += closedLosses;

  const totalDecided = wins + losses;
  const winRate = totalDecided > 0 ? (wins / totalDecided) * 100 : 0;

  // ===== ROI =====
  const roi = totalVolume > 0 ? (totalRealizedPnl / totalVolume) * 100 : 0;

  // ===== PROFIT FACTOR =====
  const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? 5 : 1) : grossProfit / grossLoss;

  // ===== ACTIVITY & TIMING =====
  const daysSet = new Set();
  const hoursSet = new Set();
  const dailyPnl = {};

  for (const t of trades) {
    const ts = t.timestamp > 1e12 ? t.timestamp : t.timestamp * 1000;
    const d = new Date(ts);
    const dayKey = d.toISOString().substring(0, 10);
    daysSet.add(dayKey);
    hoursSet.add(d.getUTCHours());

    if (!dailyPnl[dayKey]) dailyPnl[dayKey] = { pnl: 0, volume: 0 };
    dailyPnl[dayKey].volume += Number(t.size) * Number(t.price);
    if (t.side === 'SELL') {
      const asset = t.asset || t.conditionId;
      const queue = positionQueue[asset] || [];
      if (queue.length > 0) {
        const avgCost = queue.reduce(function(s,q){return s+q.price*q.size;},0) /
                        queue.reduce(function(s,q){return s+q.size;},0);
        dailyPnl[dayKey].pnl += Number(t.size) * (Number(t.price) - avgCost);
      }
    }
  }

  const activityDays = Math.max(daysSet.size, 1);
  const tradesPerMonth = tradeCount / Math.max(1, activityDays / 30);
  const avgTradeSize = tradeCount > 0 ? totalVolume / tradeCount : 0;

  // ===== CONSISTENCY (std dev of daily returns) =====
  const dailyReturns = Object.values(dailyPnl).map(function(d) {
    return d.volume > 0 ? (d.pnl / d.volume) * 100 : 0;
  });

  let consistency = 50; // default for low data
  if (dailyReturns.length >= 3) {
    const avgReturn = dailyReturns.reduce(function(a,b){return a+b;},0) / dailyReturns.length;
    const variance = dailyReturns.reduce(function(s,r){return s+Math.pow(r-avgReturn,2);},0) / dailyReturns.length;
    const stdDev = Math.sqrt(variance);
    // Lower stdDev = more consistent. Scale: 0 stdDev = 100, stdDev > 50 = 0
    consistency = Math.max(0, Math.min(100, 100 - stdDev * 2));
    // Bonus for positive average returns
    if (avgReturn > 0) consistency = Math.min(100, consistency + avgReturn * 0.5);
  }

  // ===== MAX DRAWDOWN (from equity curve) =====
  let peak = 0;
  let maxDD = 0;
  let runningPnl = 0;
  for (const t of trades) {
    const size = Number(t.size);
    const price = Number(t.price);
    const asset = t.asset || t.conditionId;
    if (t.side === 'SELL') {
      const queue = positionQueue[asset] || [];
      if (queue.length > 0) {
        const avgCost = queue.reduce(function(s,q){return s+q.price*q.size;},0) /
                        queue.reduce(function(s,q){return s+q.size;},0);
        runningPnl += size * (price - avgCost);
      }
    }
    if (runningPnl > peak) peak = runningPnl;
    const dd = peak > 0 ? ((peak - runningPnl) / peak) * 100 : 0;
    if (dd > maxDD) maxDD = dd;
  }
  // If we have closed PnL data, use that for drawdown context
  if (totalRealizedPnl < 0) {
    maxDD = Math.max(maxDD, Math.abs(roi));
  }

  // ===== TIMING SCORE =====
  const hourSpread = hoursSet.size / 24; // 0-1
  const daySpread = Math.min(1, activityDays / 30); // 0-1
  const timingScore = Math.min(100, (hourSpread * 50 + daySpread * 50));

  // ===== TRUST SCORE (composite) =====
  const rN = Math.min(100, Math.max(0, ((roi + 50) / 200) * 100)); // roi mapped from -50..150 to 0..100
  const wN = Math.min(100, Math.max(0, winRate));
  const cN = Math.min(100, Math.max(0, consistency));
  const ddNorm = Math.min(100, Math.max(0, 100 - maxDD * 2)); // lower dd = higher score
  const pfN = Math.min(100, Math.max(0, profitFactor >= 5 ? 100 : (profitFactor / 5) * 100));
  const aN = Math.min(100, Math.max(0, activityDays >= 30 ? 100 : (activityDays / 30) * 100));
  const sC = tradeCount >= 100 ? 100 : tradeCount >= 50 ? 85 : tradeCount >= 20 ? 70 : tradeCount >= 10 ? 55 : tradeCount >= 5 ? 40 : 20;

  let trustScore =
    rN * 0.20 +
    wN * 0.20 +
    cN * 0.15 +
    ddNorm * 0.15 +
    pfN * 0.10 +
    aN * 0.05 +
    sC * 0.15;

  // Penalties
  if (maxDD > 50) trustScore = Math.min(trustScore, 40);
  if (profitFactor < 0.5) trustScore = Math.min(trustScore, 25);
  if (tradeCount < 5) trustScore *= 0.6;
  trustScore = Math.min(100, Math.max(0, trustScore));

  // ===== RISK LEVEL =====
  let riskLevel = 'MEDIUM';
  if (maxDD < 20 && consistency > 60 && profitFactor > 1.2 && winRate > 55) riskLevel = 'LOW';
  else if (maxDD > 40 || (profitFactor < 0.8 && tradeCount > 10) || (winRate < 35 && tradeCount > 10)) riskLevel = 'HIGH';

  // ===== EDGE SCORE =====
  const edgeScore = Math.min(100,
    rN * 0.30 +
    cN * 0.25 +
    wN * 0.15 +
    ddNorm * 0.10 +
    timingScore * 0.10 +
    pfN * 0.10
  );

  return {
    trustScore: Math.round(trustScore * 100) / 100,
    edgeScore: Math.round(edgeScore * 100) / 100,
    roi: Math.round(roi * 100) / 100,
    winRate: Math.round(winRate * 100) / 100,
    consistency: Math.round(consistency * 100) / 100,
    profitFactor: Math.round(profitFactor * 100) / 100,
    maxDrawdown: Math.round(maxDD * 100) / 100,
    totalTrades: tradeCount,
    activityDays: activityDays,
    avgTradeSize: Math.round(avgTradeSize * 100) / 100,
    totalVolumeUsd: Math.round(totalVolume * 100) / 100,
    timingScore: Math.round(timingScore * 100) / 100,
    riskLevel,
    _debug: { wins, losses, grossProfit: Math.round(grossProfit*100)/100, grossLoss: Math.round(grossLoss*100)/100, closedPnl: Math.round(closedPnl*100)/100, totalRealizedPnl: Math.round(totalRealizedPnl*100)/100 },
  };
}

async function syncOne(trader, verbose) {
  const addr = trader.proxyWallet;

  // Fetch up to 500 trades
  let allTrades = [];
  for (let pg = 0; pg < 5; pg++) {
    const r = await getTrades(addr, 100, pg * 100);
    if (!r.data || !Array.isArray(r.data) || r.data.length === 0) break;
    allTrades = allTrades.concat(r.data);
    if (r.data.length < 100) break;
  }

  const closedR = await getClosed(addr, 200);
  const closed = (closedR.data && Array.isArray(closedR.data)) ? closedR.data : [];

  if (!allTrades.length && !closed.length) {
    return { synced: false, reason: 'no data', addr };
  }

  // Profile
  const profile = await getProfile(addr);
  const scores = calculateAllScores(allTrades, closed);

  if (!scores) return { synced: false, reason: 'calc failed', addr };

  // Determine categories from trade data
  const cats = new Set();
  if (allTrades && allTrades.length > 0) {
    for (const t of allTrades) {
      const title = (t.title || t.eventSlug || '').toLowerCase();
      if (title.match(/election|trump|biden|politic|vote|democrat|republican|senate|congress|white house/)) cats.add('politics');
      else if (title.match(/btc|bitcoin|eth|ethereum|crypto|solana|defi|nft|token|coin/)) cats.add('crypto');
      else if (title.match(/football|nfl|nba|soccer|mlb|nhl|ufc|mma|boxing|tennis|golf|sport|game|match/)) cats.add('sports');
      else if (title.match(/fed|rate|inflation|gdp|stock|market|econom|recession|earnings/)) cats.add('economics');
      else if (title.match(/movie|music|award|oscar|grammy|celebrity|box office|entertainment/)) cats.add('culture');
      else if (title.match(/climate|weather|disaster|earthquake|flood|temperature/)) cats.add('climate-weather');
      else if (title.match(/ai|tech|space|nasa|rocket|science|biotech/)) cats.add('science-tech');
      else if (title.match(/war|geopolit|conflict|russia|ukraine|china|diplomacy|military/)) cats.add('geopolitics');
      else cats.add('general');
    }
  }
  const categories = cats.size > 0 ? Array.from(cats) : trader.categories || ['general'];

  await p.polymarketTrader.update({
    where: { proxyWallet: addr },
    data: {
      displayName: profile ? profile.name : null,
      pseudonym: profile ? profile.pseudonym : null,
      verifiedBadge: profile ? (profile.verifiedBadge === true) : false,
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
      categories,
      lastSyncedAt: new Date(),
    },
  });

  return Object.assign({ synced: true, addr }, scores);
}

async function main() {
  console.log('\n=== PRODUCTION SYNC ENGINE ===\n');

  // Count remaining
  const pending = await p.polymarketTrader.count({ where: { totalTrades: 0 } });
  console.log('Traders pending sync: ' + pending);
  console.log('Already synced: ' + totalSynced);
  console.log('Processing in batches of 50...\n');

  while (true) {
    const batch = await p.polymarketTrader.findMany({
      where: { totalTrades: 0 },
      take: 50,
      orderBy: { lastSyncedAt: 'asc' },
    });

    if (batch.length === 0) {
      console.log('\n=== ALL TRADERS SYNCED ===');
      break;
    }

    console.log('\n--- Batch: ' + batch.length + ' traders ---');

    for (const trader of batch) {
      totalProcessed++;
      const r = await syncOne(trader, false);

      if (r.synced) {
        totalSynced++;
        console.log('  #' + totalSynced + ' ' + r.addr.substring(0,8) + '... | trust:' + r.trustScore + ' edge:' + r.edgeScore + ' | trades:' + r.totalTrades + ' roi:' + r.roi + '% win:' + r.winRate + '% pf:' + r.profitFactor + ' dd:' + r.maxDrawdown + '% risk:' + r.riskLevel);
      } else {
        totalSkipped++;
        // Mark as attempted to avoid infinite loop
        if (r.reason === 'no data') {
          await p.polymarketTrader.update({
            where: { proxyWallet: trader.proxyWallet },
            data: { lastSyncedAt: new Date(), totalTrades: 0 },
          });
        }
      }

      // Rate limit
      await new Promise(function(r) { setTimeout(r, 400); });
    }

    // Progress report
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const remaining = await p.polymarketTrader.count({ where: { totalTrades: 0 } });
    console.log('Progress: processed=' + totalProcessed + ' synced=' + totalSynced + ' skipped=' + totalSkipped + ' remaining=' + remaining + ' elapsed=' + elapsed + 's');

    if (remaining === 0) break;
  }

  // Final report
  const finalTotal = await p.polymarketTrader.count();
  const finalScored = await p.polymarketTrader.count({ where: { trustScore: { gt: 0 } } });
  console.log('\n=== FINAL REPORT ===');
  console.log('Total traders DB: ' + finalTotal);
  console.log('Traders with scores: ' + finalScored);
  console.log('Total synced this run: ' + totalSynced);

  console.log('\n=== TOP 20 BY TRUST SCORE ===');
  const top20 = await p.polymarketTrader.findMany({
    where: { trustScore: { gt: 0 }, totalTrades: { gt: 5 } },
    take: 20,
    orderBy: { trustScore: 'desc' },
  });
  top20.forEach(function(t, i) {
    console.log(
      '#' + (i+1) + ' ' + t.proxyWallet +
      ' | trust:' + Number(t.trustScore) +
      ' edge:' + Number(t.edgeScore) +
      ' | trades:' + t.totalTrades +
      ' roi:' + Number(t.roi) + '%' +
      ' win:' + Number(t.winRate) + '%' +
      ' pf:' + Number(t.profitFactor) +
      ' dd:' + Number(t.maxDrawdown) + '%' +
      ' cons:' + Number(t.consistency) +
      ' risk:' + t.riskLevel +
      ' vol:$' + Number(t.totalVolumeUsd).toLocaleString() +
      ' cat:[' + t.categories.join(',') + ']'
    );
  });

  await p.$disconnect();
}

main().catch(function(e) { console.error('FATAL:', e); p.$disconnect(); process.exit(1); });
