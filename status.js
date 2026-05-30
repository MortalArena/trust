const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.polymarketTrader.count({where:{totalTrades:0}}).then(function(c){
  console.log('Pending sync:', c);
  return p.polymarketTrader.count({where:{trustScore:{gt:0}}});
}).then(function(c){
  console.log('With scores:', c);
  p.$disconnect();
});
