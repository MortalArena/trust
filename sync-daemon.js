const { PrismaClient } = require('@prisma/client');
const https = require('https');
const http = require('http');

const p = new PrismaClient();
let isRunning = false;

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { Accept: 'application/json' }, timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve([]); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function getTrades(address, limit, offset) {
  try { return await fetchJSON('https://data-api.polymarket.com/trades?user=' + address + '&limit=' + limit + '&offset=' + offset + '&takerOnly=false'); } catch { return []; }
}
async function getClosed(address, limit) {
  try { return await fetchJSON('https://data-api.polymarket.com/closed-positions?user=' + address + '&limit=' + limit); } catch { return []; }
}
async function getProfile(address) {
  try { return await fetchJSON('https://gamma-api.polymarket.com/public-profile?address=' + address) || null; } catch { return null; }
}

function calcScores(trades, closed) {
  let realizedPnl = 0, totalVolume = 0, wins = 0, losses = 0;
  if (closed) for (const pos of closed) { const rp = Number(pos.realizedPnl || pos.cashPnl || 0); realizedPnl += rp; if (rp > 0) wins++; else if (rp < 0) losses++; }
  const assetPos = {}; let tradePnl = 0;
  for (const t of trades) {
    totalVolume += Number(t.size) * Number(t.price);
    const asset = t.asset || t.conditionId;
    if (t.side === 'BUY') { if (!assetPos[asset]) assetPos[asset] = { cost: 0, size: 0 }; assetPos[asset].cost += Number(t.size) * Number(t.price); assetPos[asset].size += Number(t.size); }
    else { const pos = assetPos[asset]; if (pos && pos.size > 0) { const pnl = Number(t.size) * (Number(t.price) - pos.cost / pos.size); tradePnl += pnl; if (pnl > 0) wins++; else if (pnl < 0) losses++; const m = Math.min(Number(t.size), pos.size); pos.size -= m; pos.cost -= m * (pos.cost / (pos.size + m)); } }
  }
  const totalPnl = realizedPnl + tradePnl;
  const totalTrades = trades.length;
  const winRate = wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0;
  const roi = totalVolume > 0 ? (totalPnl / totalVolume) * 100 : 0;
  const days = new Set(); const hours = new Set();
  for (const t of trades) { const d = new Date((t.timestamp > 1e12 ? t.timestamp : t.timestamp * 1000)); days.add(d.toDateString()); hours.add(d.getUTCHours()); }
  const activityDays = Math.max(days.size, 1);
  const gp = trades.filter(function(t){return t.side==='SELL'}).reduce(function(s,t){return s+Number(t.size)*Number(t.price)*0.02},0)+Math.max(0,realizedPnl);
  const gl = Math.abs(trades.filter(function(t){return t.side==='BUY'}).reduce(function(s,t){return s+Number(t.size)*Number(t.price)*0.01},0))+Math.max(0,-realizedPnl);
  const pf = gl === 0 ? (gp > 0 ? 10 : 0) : gp / gl;
  const rN = Math.min(100,Math.max(0,((roi+50)/250)*100));
  const wN = Math.min(100,winRate);
  const cN = 50;
  const dN = Math.min(100,Math.max(0,100-Math.abs(Math.min(0,roi))*2));
  const pN = Math.min(100,Math.max(0,(pf/5)*100));
  const aN = Math.min(100,Math.max(0,totalTrades/Math.max(1,activityDays/30)));
  const sC = totalTrades>=50?90:totalTrades>=20?70:totalTrades>=10?55:totalTrades>=5?40:15;
  let trust = rN*0.20+wN*0.20+cN*0.20+pN*0.15+dN*0.10+aN*0.05+sC*0.10;
  if (Math.abs(roi)>500) trust = Math.min(trust,40);
  if (totalTrades<5) trust *= 0.5;
  trust = Math.min(100,Math.max(0,trust));
  let risk = 'MEDIUM';
  if (Math.abs(roi)<15 && cN>70 && pf>1.5) risk = 'LOW';
  else if (Math.abs(roi)>50 || cN<35 || pf<0.8) risk = 'HIGH';
  const edge = Math.min(100, rN*0.30+cN*0.25+wN*0.15+dN*0.15+Math.min(100,(hours.size/12)*60+(days.size/7)*40)*0.10+pN*0.05);
  return { trustScore:Math.round(trust*100)/100, edgeScore:Math.round(edge*100)/100, roi:Math.round(roi*100)/100, winRate:Math.round(winRate*100)/100, consistency:Math.round(cN*100)/100, profitFactor:Math.round(pf*100)/100, maxDrawdown:Math.round(Math.abs(Math.min(0,roi))*100)/100, totalTrades, activityDays, avgTradeSize:Math.round((totalTrades>0?totalVolume/totalTrades:0)*100)/100, totalVolumeUsd:Math.round(totalVolume*100)/100, timingScore:Math.round(Math.min(100,(hours.size/12)*60+(days.size/7)*40)*100)/100, riskLevel:risk };
}

async function syncOne(trader) {
  const addr = trader.proxyWallet;
  try {
    let all = [];
    for (let pg = 0; pg < 5; pg++) { const b = await getTrades(addr, 100, pg*100); if (!b||!b.length) break; all = all.concat(b); if (b.length<100) break; }
    const cl = await getClosed(addr, 100);
    const pr = await getProfile(addr);
    if (!all.length && (!cl||!cl.length)) return {s:false, r:'no data'};
    const s = calcScores(all, cl);
    await p.polymarketTrader.update({where:{proxyWallet:addr},data:Object.assign({displayName:pr?pr.name:null,pseudonym:pr?pr.pseudonym:null,verifiedBadge:pr?(pr.verifiedBadge||false):false,xUsername:pr?pr.xUsername:null,lastSyncedAt:new Date()},s)});
    return Object.assign({s:true,w:addr},s);
  } catch(e) { return {s:false,e:e.message}; }
}

async function runSync() {
  if (isRunning) return;
  isRunning = true;
  console.log('[SYNC] Starting continuous sync...');

  const stale = await p.polymarketTrader.findMany({ where:{totalTrades:0}, take:100, orderBy:{lastSyncedAt:'asc'} });
  if (stale.length === 0) { console.log('[SYNC] All traders synced! Checking for stale...');
    const old = await p.polymarketTrader.findMany({ where:{lastSyncedAt:{lt:new Date(Date.now()-3600000)}}, take:50, orderBy:{lastSyncedAt:'asc'} });
    if (old.length === 0) { isRunning = false; return; }
    console.log('[SYNC] Re-syncing ' + old.length + ' stale traders...');
    for (let i = 0; i < old.length; i++) { await syncOne(old[i]); await new Promise(function(r){setTimeout(r,300)}); }
    isRunning = false; return;
  }

  console.log('[SYNC] Syncing ' + stale.length + ' traders...');
  let ok = 0, skip = 0;
  for (let i = 0; i < stale.length; i++) {
    const r = await syncOne(stale[i]);
    if (r.s) { ok++; if (r.totalTrades > 0) console.log('  OK ' + r.w.substring(0,8) + ' trust:' + r.trustScore + ' edge:' + r.edgeScore + ' trades:' + r.totalTrades + ' roi:' + r.roi + '%'); }
    else skip++;
    await new Promise(function(r){setTimeout(r,300)});
  }
  const total = await p.polymarketTrader.count();
  const scored = await p.polymarketTrader.count({where:{trustScore:{gt:0}}});
  console.log('[SYNC] Batch done. OK:' + ok + ' Skip:' + skip + ' Total:' + total + ' Scored:' + scored);
  isRunning = false;
}

setInterval(runSync, 60000);
runSync().catch(function(e){console.error(e);isRunning=false});
console.log('[SYNC] Engine armed - runs every 60s');

process.on('SIGTERM', function(){p.$disconnect();process.exit(0);});
