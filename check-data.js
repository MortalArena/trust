const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const total = await p.polymarketTrader.count();
  console.log('=== DB STATUS ===');
  console.log('Total traders:', total);

  const withScores = await p.polymarketTrader.count({ where: { trustScore: { gt: 0 } } });
  console.log('Traders with real trustScore (>0):', withScores);

  const zeroScores = await p.polymarketTrader.count({ where: { trustScore: { equals: 0 } } });
  console.log('Traders with zero/empty scores:', zeroScores);

  const synced = await p.polymarketTrader.count({ where: { totalTrades: { gt: 0 } } });
  console.log('Traders with actual trade data (>0):', synced);

  console.log('\n=== TOP 5 BY TRUST SCORE ===');
  const top = await p.polymarketTrader.findMany({ take: 5, orderBy: { trustScore: 'desc' } });
  top.forEach((t, i) => {
    console.log(`#${i+1} ${t.proxyWallet} | trust: ${Number(t.trustScore)} | trades: ${t.totalTrades} | roi: ${Number(t.roi)} | winRate: ${Number(t.winRate)} | synced: ${t.lastSyncedAt.toISOString()}`);
  });

  console.log('\n=== SAMPLE RANDOM 3 ===');
  const sample = await p.polymarketTrader.findMany({ take: 3, skip: Math.floor(Math.random() * 100) });
  sample.forEach(t => {
    console.log(`${t.proxyWallet} | trust: ${Number(t.trustScore)} | trades: ${t.totalTrades} | synced: ${t.lastSyncedAt.toISOString()} | categories: [${t.categories}]`);
  });

  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
