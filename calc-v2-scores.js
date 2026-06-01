/**
 * Calculate V2 scores for ALL existing traders in DB
 * Uses existing trade data + aggregated stats
 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  console.log('Calculating V2 scores for existing traders...\n');

  const traders = await p.polymarketTrader.findMany({
    where: { totalTrades: { gt: 0 } },
    include: { trades: { take: 100, orderBy: { timestamp: 'desc' } } },
  });

  console.log(`Found ${traders.length} traders with trade data\n`);

  let updated = 0;

  for (const trader of traders) {
    const trades = trader.trades;
    
    if (trades.length < 3) continue;

    // Calculate from trades
    const totalTrades = trader.totalTrades || trades.length;
    const totalVolume = trades.reduce((s, t) => s + Number(t.valueUsd || 0), 0) || Number(trader.totalVolumeUsd || 0);
    const wins = trades.filter(t => t.outcome === 'YES').length;
    const losses = trades.filter(t => t.outcome === 'NO').length;
    const totalOutcomes = wins + losses;
    const winRate = totalOutcomes > 0 ? (wins / totalOutcomes) * 100 : (trader.winRate || 50);
    
    // Forecast
    const forecastBrier = totalOutcomes > 0 ? Math.max(0.05, 0.25 * (1 - winRate / 100)) : 0.25;
    const forecastLogLoss = totalOutcomes > 0 ? Math.max(0.2, 0.693 - Math.log(1 + totalOutcomes) * 0.08) : 0.693;
    const forecastCalibration = Math.max(0, 100 - Math.abs(winRate - 50) * 1.5);
    const predictiveScore = totalOutcomes > 0
      ? Math.max(0, Math.min(100, (0.25 - forecastBrier) / 0.25 * 40 + (0.693 - forecastLogLoss) / 0.693 * 30 + forecastCalibration * 0.3))
      : 50;

    // Alpha: estimate from ROI
    const roi = Number(trader.roi || 0);
    const alphaScore = Math.max(0, Math.min(100, 50 + roi * 1.5));

    // Confidence: from sample size
    const confMult = 1 - Math.exp(-totalTrades / 150);
    const confidenceScore = confMult * 100;

    // Behavior: from consistency
    const behaviorScore = Math.max(0, Math.min(100, 50 + (winRate - 50) * 0.4 + Number(trader.consistency || 50) * 0.3));

    // Risk
    const riskScore = Math.max(0, Math.min(100, 100 - Math.abs(roi) * 0.8));

    // PMI
    const masterPMI = Math.max(0, Math.min(100,
      predictiveScore * 0.30 + alphaScore * 0.25 + riskScore * 0.20 + behaviorScore * 0.15 + confidenceScore * 0.10
    ));

    // Edge
    const edgeScore = Math.max(0, Math.min(100,
      roi * 0.4 + winRate * 0.3 + Math.min(totalTrades, 500) * 0.2
    ));

    // Trust
    const trustScore = Math.max(0, Math.min(100,
      winRate * 0.3 + behaviorScore * 0.3 + confidenceScore * 0.2 + (100 - Math.abs(roi)) * 0.2
    ));

    await p.polymarketTrader.update({
      where: { id: trader.id },
      data: {
        predictiveScore: Math.round(predictiveScore * 10) / 10,
        alphaScore: Math.round(alphaScore * 10) / 10,
        confidenceScore: Math.round(confidenceScore * 10) / 10,
        behaviorScore: Math.round(behaviorScore * 10) / 10,
        riskScore: Math.round(riskScore * 10) / 10,
        masterPMI: Math.round(masterPMI * 10) / 10,
        edgeScore: Math.round(edgeScore * 10) / 10,
        trustScore: Math.round(trustScore * 10) / 10,
        maxDrawdown: Math.min(50, Math.abs(Math.min(0, roi))),
        timingScore: Math.round(Math.max(0, Math.min(100, 50 + roi * 0.5)) * 10) / 10,
      },
    });

    updated++;
    if (updated % 50 === 0) console.log(`  Updated: ${updated}/${traders.length}`);
  }

  const totalV2 = await p.polymarketTrader.count({ where: { masterPMI: { gt: 0 } } });
  console.log(`\n✅ V2 scores updated: ${updated} traders`);
  console.log(`📊 Total V2 scored traders: ${totalV2}`);

  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
