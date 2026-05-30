const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.polymarketTrader.count().then(function(total){
  return p.polymarketTrader.count({where:{trustScore:{gt:0}}}).then(function(scored){
    console.log('Total:', total, '| With scores:', scored);
    return p.polymarketTrader.findMany({where:{trustScore:{gt:0}}, take:5, orderBy:{trustScore:'desc'}});
  });
}).then(function(top){
  top.forEach(function(t,i){
    console.log('#'+(i+1)+' '+t.proxyWallet.substring(0,8)+' trust:'+Number(t.trustScore)+' trades:'+t.totalTrades+' roi:'+Number(t.roi)+'%');
  });
  p.$disconnect();
}).catch(function(e){console.error(e);p.$disconnect()});
