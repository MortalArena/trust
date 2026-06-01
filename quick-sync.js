/**
 * QUICK SYNC — Pull Top Active Traders from Polymarket Data API
 * Uses the /users endpoint which returns top traders by volume
 */

const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

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
  console.log('  QUICK SYNC — TOP ACTIVE TRADERS');
  console.log('═══════════════════════════════════════════════════\n');

  const existing = await p.polymarketTrader.count({ where: { totalTrades: { gt: 0 }, masterPMI: { gt: 0 } } });
  console.log(`Existing V2 traders: ${existing}\n`);

  // Try different Polymarket Data API endpoints to find active traders
  const endpoints = [
    'https://data-api.polymarket.com/users?limit=100&order=volume24hr&ascending=false',
    'https://data-api.polymarket.com/leaders?limit=100',
    'https://gamma-api.polymarket.com/users?limit=100&order=volume24hr&ascending=false',
    'https://gamma-api.polymarket.com/leaderboard?limit=100',
  ];

  const allWallets = new Map();

  for (const url of endpoints) {
    console.log(`Trying: ${url}`);
    const data = await fetchJSON(url);
    
    if (data) {
      console.log(`  Response type: ${typeof data}, isArray: ${Array.isArray(data)}`);
      if (Array.isArray(data) && data.length > 0) {
        console.log(`  Found ${data.length} items`);
        console.log(`  Sample keys: ${Object.keys(data[0] || {}).join(', ')}`);
        
        for (const item of data) {
          const wallet = item.proxyWallet || item.wallet || item.address || item.user || item.maker?.user;
          if (wallet && wallet.startsWith('0x')) {
            allWallets.set(wallet.toLowerCase(), {
              displayName: item.displayName || item.name || item.username || null,
              volume: Number(item.volume || item.volume24hr || item.totalVolume || 0),
              trades: Number(item.trades || item.totalTrades || 0),
              winRate: Number(item.winRate || 0),
              roi: Number(item.roi || 0),
              categories: item.categories || [],
            });
          }
        }
      } else if (data && typeof data === 'object') {
        console.log(`  Object keys: ${Object.keys(data).join(', ')}`);
        // Try nested arrays
        for (const key of Object.keys(data)) {
          if (Array.isArray(data[key]) && data[key].length > 0) {
            console.log(`  Found array in key "${key}": ${data[key].length} items`);
            for (const item of data[key]) {
              const wallet = item.proxyWallet || item.wallet || item.address || item.user;
              if (wallet && wallet.startsWith('0x')) {
                allWallets.set(wallet.toLowerCase(), {
                  displayName: item.displayName || item.name || item.username || null,
                  volume: Number(item.volume || item.volume24hr || 0),
                  trades: Number(item.trades || 0),
                  winRate: Number(item.winRate || 0),
                  roi: Number(item.roi || 0),
                  categories: item.categories || [],
                });
              }
            }
          }
        }
      }
    } else {
      console.log('  No response');
    }
    await sleep(500);
  }

  // Also try fetching from top markets' events
  console.log('\nFetching top markets for trader discovery...');
  const topMarkets = await fetchJSON('https://gamma-api.polymarket.com/markets?limit=20&active=true&closed=false&order=volume24hr&ascending=false');
  
  if (topMarkets && Array.isArray(topMarkets)) {
    console.log(`Found ${topMarkets.length} top markets`);
    
    for (const market of topMarkets.slice(0, 10)) {
      if (!market.conditionId) continue;
      
      // Try to fetch trades for this market from data API
      const tradesUrl = `https://gamma-api.polymarket.com/trades?limit=50&market=${encodeURIComponent(market.id)}`;
      const trades = await fetchJSON(tradesUrl);
      
      if (trades && Array.isArray(trades) && trades.length > 0) {
        console.log(`  Market ${market.question?.slice(0, 40)}: ${trades.length} trades`);
        
        for (const t of trades) {
          const wallet = t.proxyWallet || t.user || t.maker?.user || t.taker?.user;
          if (wallet && wallet.startsWith('0x') && !allWallets.has(wallet.toLowerCase())) {
            allWallets.set(wallet.toLowerCase(), {
              displayName: null,
              volume: (t.price || 0) * (t.size || 0),
              trades: 1,
              winRate: 0,
              roi: 0,
              categories: [],
            });
          }
        }
      } else {
        // Try with conditionId
        const tradesUrl2 = `https://gamma-api.polymarket.com/trades?limit=50&condition_id=${encodeURIComponent(market.conditionId)}`;
        const trades2 = await fetchJSON(tradesUrl2);
        
        if (trades2 && Array.isArray(trades2) && trades2.length > 0) {
          console.log(`  Market (by conditionId) ${market.question?.slice(0, 40)}: ${trades2.length} trades`);
          
          for (const t of trades2) {
            const wallet = t.proxyWallet || t.user || t.maker?.user || t.taker?.user;
            if (wallet && wallet.startsWith('0x') && !allWallets.has(wallet.toLowerCase())) {
              allWallets.set(wallet.toLowerCase(), {
                displayName: null,
                volume: (t.price || 0) * (t.size || 0),
                trades: 1,
                winRate: 0,
                roi: 0,
                categories: [],
              });
            }
          }
        }
      }
      
      await sleep(200);
    }
  }

  console.log(`\nTotal unique wallets found: ${allWallets.size}`);

  // Now fetch detailed data for each wallet from Polymarket
  let processed = 0;
  for (const [wallet, basicData] of allWallets) {
    try {
      // Fetch user profile from Polymarket
      const profile = await fetchJSON(`https://gamma-api.polymarket.com/public-profile?address=${wallet}`);
      
      // Fetch user's positions to calculate stats
      const positions = await fetchJSON(`https://gamma-api.polymarket.com/positions?user=${wallet}&limit=50&closed=false`);
      const closedPositions = await fetchJSON(`https://gamma-api.polymarket.com/positions?user=${wallet}&limit=50&closed=true`);

      let totalTrades = basicData.trades || 0;
      let totalVolume = basicData.volume || 0;
      let wins = 0;
      let losses = 0;
      let categories = new Set(basicData.categories || []);
      let lastTrade = 0;

      if (positions && Array.isArray(positions)) {
        totalTrades += positions.length;
        for (const pos of positions) {
          totalVolume += Number(pos.size || 0) * Number(pos.avgPrice || 0);
          if (pos.updatedAt && pos.updatedAt > lastTrade) lastTrade = pos.updatedAt;
        }
      }

      if (closedPositions && Array.isArray(closedPositions)) {
        for (const pos of closedPositions) {
          totalTrades++;
          totalVolume += Number(pos.size || 0) * Number(pos.avgPrice || 0);
          if (Number(pos.realizedPnl || 0) > 0) wins++;
          else if (Number(pos.realizedPnl || 0) < 0) losses++;
          if (pos.updatedAt && pos.updatedAt > lastTrade) lastTrade = pos.updatedAt;
        }
      }

      const totalOutcomes = wins + losses;
      const winRate = totalOutcomes > 0 ? (wins / totalOutcomes) * 100 : 50;
      const roi = totalVolume > 0 ? ((wins - losses) / totalVolume) * 100 : 0;
      const avgTradeSize = totalTrades > 0 ? totalVolume / totalTrades : 0;
      const activityDays = lastTrade > 0 ? Math.max(1, Math.round((Date.now() / 1000 - lastTrade) / 86400)) : 30;

      const riskLevel = Math.abs(roi) > 50 ? 'HIGH' : Math.abs(roi) > 20 ? 'MEDIUM' : 'LOW';

      // V2 Scores
      const forecastBrier = totalOutcomes > 0 ? Math.max(0.05, 0.25 - (winRate / 100) * 0.2) : 0.25;
      const forecastLogLoss = totalOutcomes > 0 ? Math.max(0.2, 0.693 - Math.log(1 + totalOutcomes) * 0.1) : 0.693;
      const forecastCalibration = totalOutcomes > 0 ? Math.max(0, 100 - Math.abs(winRate - 50) * 1.5) : 50;
      const predictiveScore = totalOutcomes > 0
        ? Math.max(0, Math.min(100, (0.25 - forecastBrier) / 0.25 * 40 + (0.693 - forecastLogLoss) / 0.693 * 30 + forecastCalibration * 0.3))
        : 0;
      const alphaScore = Math.max(0, Math.min(100, 50 + roi * 2));
      const confidenceMultiplier = 1 - Math.exp(-totalTrades / 150);
      const confidenceScore = confidenceMultiplier * 100;
      const behaviorScore = Math.max(0, Math.min(100, 50 + (winRate - 50) * 0.5));
      const riskScore = Math.max(0, Math.min(100, 100 - Math.abs(roi)));
      const masterPMI = Math.max(0, Math.min(100,
        predictiveScore * 0.30 + alphaScore * 0.25 + riskScore * 0.20 + behaviorScore * 0.15 + confidenceScore * 0.10
      ));
      const edgeScore = Math.max(0, Math.min(100, roi * 0.4 + winRate * 0.3 + Math.min(totalTrades, 500) * 0.2 + Math.min(categories.size * 10, 50) * 0.1));
      const trustScore = Math.max(0, Math.min(100, winRate * 0.3 + behaviorScore * 0.25 + confidenceScore * 0.2 + (100 - Math.abs(roi)) * 0.15 + Math.min(activityDays, 100) * 0.1));

      await p.polymarketTrader.upsert({
        where: { proxyWallet: wallet },
        update: {
          displayName: basicData.displayName || profile?.name || undefined,
          totalTrades,
          winRate: Math.round(winRate * 100) / 100,
          roi: Math.round(roi * 100) / 100,
          consistency: Math.round(behaviorScore * 100) / 100,
          profitFactor: losses > 0 ? Math.round((wins / losses) * 100) / 100 : wins || 0,
          riskLevel,
          totalVolumeUsd: Math.round(totalVolume * 100) / 100,
          avgTradeSize: Math.round(avgTradeSize * 100) / 100,
          activityDays,
          categories: [...categories],
          lastSyncedAt: new Date(),
          predictiveScore: Math.round(predictiveScore * 10) / 10,
          alphaScore: Math.round(alphaScore * 10) / 10,
          behaviorScore: Math.round(behaviorScore * 10) / 10,
          confidenceScore: Math.round(confidenceScore * 10) / 10,
          riskScore: Math.round(riskScore * 10) / 10,
          masterPMI: Math.round(masterPMI * 10) / 10,
          trustScore: Math.round(trustScore * 10) / 10,
          edgeScore: Math.round(edgeScore * 10) / 10,
          maxDrawdown: Math.min(50, Math.abs(Math.min(0, roi))),
          timingScore: Math.round(Math.max(0, Math.min(100, 50 + roi * 0.5)) * 10) / 10,
        },
        create: {
          proxyWallet: wallet,
          displayName: basicData.displayName || profile?.name || undefined,
          totalTrades,
          winRate: Math.round(winRate * 100) / 100,
          roi: Math.round(roi * 100) / 100,
          consistency: Math.round(behaviorScore * 100) / 100,
          profitFactor: losses > 0 ? Math.round((wins / losses) * 100) / 100 : wins || 0,
          riskLevel,
          totalVolumeUsd: Math.round(totalVolume * 100) / 100,
          avgTradeSize: Math.round(avgTradeSize * 100) / 100,
          activityDays,
          categories: [...categories],
          lastSyncedAt: new Date(),
          predictiveScore: Math.round(predictiveScore * 10) / 10,
          alphaScore: Math.round(alphaScore * 10) / 10,
          behaviorScore: Math.round(behaviorScore * 10) / 10,
          confidenceScore: Math.round(confidenceScore * 10) / 10,
          riskScore: Math.round(riskScore * 10) / 10,
          masterPMI: Math.round(masterPMI * 10) / 10,
          trustScore: Math.round(trustScore * 10) / 10,
          edgeScore: Math.round(edgeScore * 10) / 10,
          maxDrawdown: Math.min(50, Math.abs(Math.min(0, roi))),
          timingScore: Math.round(Math.max(0, Math.min(100, 50 + roi * 0.5)) * 10) / 10,
        },
      });

      processed++;
      if (processed % 10 === 0) console.log(`  Processed: ${processed}/${allWallets.size}`);

      await sleep(300); // Polite delay

    } catch (e) {
      // Skip failed wallets
    }
  }

  const [finalTraders, finalV2] = await Promise.all([
    p.polymarketTrader.count(),
    p.polymarketTrader.count({ where: { masterPMI: { gt: 0 } } }),
  ]);

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  FINAL RESULTS');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Wallets found:     ${allWallets.size}`);
  console.log(`  Traders processed: ${processed}`);
  console.log(`  Total traders:     ${finalTraders}`);
  console.log(`  V2 scored:         ${finalV2}`);
  console.log('═══════════════════════════════════════════════════\n');

  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
