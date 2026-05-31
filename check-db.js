const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const [traders, trades, v2, withTrades] = await Promise.all([
    p.polymarketTrader.count(),
    p.polymarketTrade.count(),
    p.polymarketTrader.count({ where: { masterPMI: { gt: 0 } } }),
    p.polymarketTrader.count({ where: { totalTrades: { gt: 0 } } }),
  ]);
  console.log(JSON.stringify({ traders, trades, v2Scored: v2, withTradeData: withTrades }, null, 2));
}
main().then(() => p.$disconnect());
