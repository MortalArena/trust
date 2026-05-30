const { PrismaClient } = require('@prisma/client');
const https = require('https');
const http = require('http');
const p = new PrismaClient();

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { Accept: 'application/json' }, timeout: 20000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(data) }); } catch(e) { resolve({ status: res.statusCode, data: null }); } });
    });
    req.on('error', (e) => resolve({ status: 0, error: e.message, data: null }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, error: 'timeout', data: null }); });
  });
}

async function getTrades(addr, limit, offset) {
  try { const r = await fetchJSON('https://data-api.polymarket.com/trades?user=' + addr + '&limit=' + limit + '&offset=' + offset + '&takerOnly=false'); return r.data || []; } catch { return []; }
}
async function getClosed(addr, limit) {
  try { const r = await fetchJSON('https://data-api.polymarket.com/closed-positions?user=' + addr + '&limit=' + limit); return r.data || []; } catch { return []; }
}
async function getProfile(addr) {
  try { const r = await fetchJSON('https://gamma-api.polymarket.com/public-profile?address=' + addr); return (r && r.data) ? r.data : null; } catch { return null; }
}

function calcScores(trades, closed) {
  if (!trades || trades.length === 0) return null;
  let realizedPnl = 0, totalVolume = 0, wins = 0, losses = 0;
  if (closed) for (const pos of closed) { const rp = Number(pos.realizedPnl || pos.cashPnl || 0); realizedPnl += rp; if (rp > 0) wins++; else if (rp < 0) losses++; }
  const posQ = {}; let tradePnl = 0;
  for (const t of trades) {
    const size = Number(t.size), price = Number(t.price), notional = size * price;
    totalVolume += notional;
    const asset = t.asset || t.conditionId;
    if (t.side === 'BUY') { if (!posQ[asset]) posQ[asset] = []; posQ[asset].push({ size, price }); }
    else { const q = posQ[asset] || []; let rem = size; while (rem > 0.001 && q.length > 0) { const m = Math.min(rem, q[0].size); tradePnl += m * (price - q[0].price); if (tradePnl > 0 ? wins++ : losses++); q[0].size -= m; rem -= m; if (q[0].size < 0.001) q.shift(); } }
  }
  if (closed && closed.length > 0 && realizedPnl !== 0) tradePnl = realizedPnl;
  const totalTrades = trades.length;
  const totalDecided = wins + losses;
  const winRate = totalDecided > 0 ? (wins / totalDecided) * 100 : 0;
  const roi = totalVolume > 0 ? (tradePnl / totalVolume) * 100 : 0;
  const days = new Set(), hours = new Set();
  for (const t of trades) { const d = new Date((t.timestamp > 1e12 ? t.timestamp : t.timestamp * 1000)); days.add(d.toISOString().substring(0,10)); hours.add(d.getUTCHours()); }
  const activityDays = Math.max(days.size, 1);
  const avgTradeSize = totalTrades > 0 ? totalVolume / totalTrades : 0;
  const pf = losses > 0 ? wins / Math.max(losses, 1) : (wins > 0 ? 5 : 1);
  const consistency = Math.min(100, Math.max(0, 50 + (winRate - 50) * 0.5 + (roi > 0 ? roi * 0.2 : 0)));
  const timingScore = Math.min(100, (hours.size / 12) * 60 + Math.min(1, days.size / 14) * 40);
  const rN = Math.min(100, Math.max(0, ((roi + 50) / 200) * 100));
  const wN = Math.min(100, Math.max(0, winRate));
  const cN = Math.min(100, Math.max(0, consistency));
  const ddN = Math.min(100, Math.max(0, 100 - Math.abs(Math.min(0, roi)) * 2));
  const pfN = Math.min(100, Math.max(0, (pf / 5) * 100));
  const sC = totalTrades >= 50 ? 100 : totalTrades >= 20 ? 75 : totalTrades >= 10 ? 55 : totalTrades >= 5 ? 35 : 15;
  let trust = rN * 0.20 + wN * 0.20 + cN * 0.15 + ddN * 0.15 + pfN * 0.10 + sC * 0.20;
  if (totalTrades < 5) trust *= 0.6;
  trust = Math.min(100, Math.max(0, trust));
  let risk = 'MEDIUM';
  if (Math.abs(roi) < 15 && consistency > 60 && pf > 1.2 && winRate > 55) risk = 'LOW';
  else if (Math.abs(roi) > 50 || (pf < 0.8 && totalTrades > 10) || (winRate < 35 && totalTrades > 10)) risk = 'HIGH';
  const edge = Math.min(100, rN * 0.30 + cN * 0.25 + wN * 0.15 + ddN * 0.10 + timingScore * 0.10 + pfN * 0.10);
  return { trustScore: Math.round(trust*100)/100, edgeScore: Math.round(edge*100)/100, roi: Math.round(roi*100)/100, winRate: Math.round(winRate*100)/100, consistency: Math.round(consistency*100)/100, profitFactor: Math.round(pf*100)/100, maxDrawdown: Math.round(Math.abs(Math.min(0,roi))*100)/100, totalTrades, activityDays, avgTradeSize: Math.round(avgTradeSize*100)/100, totalVolumeUsd: Math.round(totalVolume*100)/100, timingScore: Math.round(timingScore*100)/100, riskLevel: risk };
}

async function main() {
  const pending = await p.polymarketTrader.count({ where: { totalTrades: 0 } });
  console.log('Pending sync:', pending, '| Starting batch of 100...\n');
  let synced = 0, skip = 0;
  for (let batch = 0; batch < 10; batch++) {
    const traders = await p.polymarketTrader.findMany({ where: { totalTrades: 0 }, take: 10, orderBy: { lastSyncedAt: 'asc' } });
    if (traders.length === 0) break;
    for (const trader of traders) {
      const addr = trader.proxyWallet;
      try {
        let allTrades = [];
        for (let pg = 0; pg < 5; pg++) { const b = await getTrades(addr, 100, pg*100); if (!b||!b.length) break; allTrades = allTrades.concat(b); if (b.length<100) break; }
        const closed = await getClosed(addr, 100);
        const profile = await getProfile(addr);
        if (!allTrades.length && (!closed||!closed.length)) { await p.polymarketTrader.update({where:{proxyWallet:addr},data:{lastSyncedAt:new Date()}}); skip++; continue; }
        const s = calcScores(allTrades, closed);
        if (!s) { skip++; continue; }
        const cats = new Set();
        for (const t of allTrades) { const title=(t.title||'').toLowerCase(); if(title.match(/election|trump|biden|politic|vote/))cats.add('politics'); else if(title.match(/btc|bitcoin|eth|crypto|solana/))cats.add('crypto'); else if(title.match(/nfl|nba|soccer|football|sport|game|match/))cats.add('sports'); else if(title.match(/fed|rate|inflation|gdp|stock|market|econom/))cats.add('economics'); else if(title.match(/movie|music|award|oscar|entertainment/))cats.add('culture'); else cats.add('general'); }
        const categories = cats.size > 0 ? Array.from(cats) : trader.categories.length > 0 ? trader.categories : ['general'];
        await p.polymarketTrader.update({ where:{proxyWallet:addr}, data: Object.assign({ displayName:profile?profile.name:null, pseudonym:profile?profile.pseudonym:null, verifiedBadge:profile?(profile.verifiedBadge===true):false, xUsername:profile?profile.xUsername:null, lastSyncedAt:new Date(), categories }, s) });
        synced++;
        console.log('  #' + synced + ' ' + addr.substring(0,8) + '... trust:' + s.trustScore + ' edge:' + s.edgeScore + ' trades:' + s.totalTrades + ' roi:' + s.roi + '% win:' + s.winRate + '% pf:' + s.profitFactor + ' risk:' + s.riskLevel + ' cat:[' + categories.join(',') + ']');
      } catch(e) { console.log('  ERR ' + addr.substring(0,8) + ': ' + e.message); skip++; }
      await new Promise(function(r){setTimeout(r,350)});
    }
    console.log('  --- Batch ' + (batch+1) + ' done. Synced so far: ' + synced + ' ---\n');
  }
  const totalScored = await p.polymarketTrader.count({where:{trustScore:{gt:0}}});
  console.log('=== DONE === Synced:', synced, '| Skipped:', skip, '| Total with scores:', totalScored);
  console.log('\nTOP 10 BY TRUST:');
  const top = await p.polymarketTrader.findMany({where:{trustScore:{gt:0},totalTrades:{gt:5}},take:10,orderBy:{trustScore:'desc'}});
  top.forEach(function(t,i){ console.log('#'+(i+1)+' '+t.proxyWallet+' trust:'+Number(t.trustScore)+' edge:'+Number(t.edgeScore)+' trades:'+t.totalTrades+' roi:'+Number(t.roi)+'% win:'+Number(t.winRate)+'% pf:'+Number(t.profitFactor)+' dd:'+Number(t.maxDrawdown)+'% cons:'+Number(t.consistency)+' risk:'+t.riskLevel); });
  p.$disconnect();
}

main().catch(function(e){console.error(e);p.$disconnect()});
