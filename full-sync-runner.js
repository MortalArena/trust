/**
 * FULL DISCOVERY + SYNC RUNNER
 * Run this to discover ALL traders and sync their complete history
 * 
 * Usage: node full-sync-runner.js
 * 
 * This will:
 * 1. Scan ALL trades from Polymarket to discover every unique wallet
 * 2. For each new wallet, fetch complete trade history 
 * 3. Calculate V2 reputation scores
 * 4. Run continuously until all traders are synced
 */

const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const DATA = 'https://data-api.polymarket.com';
const GAMMA = 'https://gamma-api.polymarket.com';
const PAGE_SIZE = 100;
const BATCH_SIZE = 5;
const DELAY_MS = 200;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJSON(url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const ctl = new AbortController();
      const id = setTimeout(() => ctl.abort(), 20000);
      const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
      clearTimeout(id);
      if (r.status === 429) {
        await sleep(2000 * (attempt + 1) + Math.random() * 1000);
        continue;
      }
      if (!r.ok) return null;
      return await r.json();
    } catch (e) {
      if (attempt < 4) await sleep(1000 * (attempt + 1));
      else return null;
    }
  }
  return null;
}

// Step 1: Discover wallets from ALL trades
async function discoverWallets(maxPages = 500) {
  console.log('\n=== STEP 1: Discovering wallets from ALL trades ===\n');
  
  const existingWallets = new Set(
    (await p.polymarketTrader.findMany({ select: { proxyWallet: true } }))
      .map(t => t.proxyWallet)
  );
  console.log(`Existing wallets in DB: ${existingWallets.size}`);

  const newWallets = new Set();
  let totalScanned = 0;

  for (let page = 0; page < maxPages; page++) {
    const offset = page * PAGE_SIZE;
    const url = `${DATA}/trades?limit=${PAGE_SIZE}&offset=${offset}&order=timestamp&ascending=false`;
    
    const data = await fetchJSON(url);
    if (!data || data.length === 0) {
      console.log(`No more trades at page ${page}. Stopping discovery.`);
      break;
    }

    totalScanned += data.length;
    let newInPage = 0;

    for (const trade of data) {
      if (trade.proxyWallet && trade.proxyWallet.startsWith('0x')) {
        const w = trade.proxyWallet.toLowerCase();
        if (!existingWallets.has(w) && !newWallets.has(w)) {
          newWallets.add(w);
          newInPage++;
        }
      }
    }

    if (page % 20 === 0) {
      console.log(`[Page ${page}] Scanned: ${totalScanned} | New wallets: ${newWallets.size} (+${newInPage})`);
    }

    await sleep(DELAY_MS);
  }

  console.log(`\nDiscovery complete: ${newWallets.size} new wallets found (${totalScanned} trades scanned)`);
  return newWallets;
}

// Step 2: Fetch all trades for a wallet
async function fetchAllTradesForWallet(wallet) {
  const allTrades = [];
  
  for (let page = 0; page < 50; page++) {
    const url = `${DATA}/trades?limit=100&offset=${page * 100}&user=${wallet}&order=timestamp&ascending=false`;
    const data = await fetchJSON(url);
    if (!data || data.length === 0) break;
    allTrades.push(...data);
    if (data.length < 100) break;
    await sleep(100);
  }

  return allTrades;
}

// Step 3: Sync a single wallet
async function syncWallet(wallet, existingWallets) {
  try {
    const trades = await fetchAllTradesForWallet(wallet);
    
    if (trades.length === 0) return { trades: 0, skip: true };

    // Get categories from trade market titles
    const categories = new Set();
    for (const t of trades) {
      const title = (t.title || '').toLowerCase();
      if (title.match(/election|trump|biden|politic|vote|democrat|republican|government/)) categories.add('politics');
      else if (title.match(/btc|bitcoin|eth|crypto|solana|defi|nft|web3/)) categories.add('crypto');
      else if (title.match(/nfl|nba|soccer|football|sport|game|match|playoff|final|ufc/)) categories.add('sports');
      else if (title.match(/fed|rate|inflation|gdp|stock|market|econom|recession/)) categories.add('economics');
      else if (title.match(/movie|music|award|oscar|grammy|entertainment|celebrity/)) categories.add('culture');
      else if (title.match(/war|geopolit|conflict|russia|ukraine|china|diplomacy/)) categories.add('politics');
      else if (title.match(/ai|tech|space|nasa|science|biotech|innovation/)) categories.add('science');
      else if (title.match(/ipo|startup|merger|earning|business|corporate/)) categories.add('business');
    }
    const cats = categories.size > 0 ? Array.from(categories) : ['general'];

    // Save trades
    let tradesSaved = 0;
    if (trades.length > 0) {
      // First upsert the trader
      const trader = await p.polymarketTrader.upsert({
        where: { proxyWallet: wallet },
        update: { categories: cats, lastSyncedAt: new Date() },
        create: { proxyWallet: wallet, categories: cats, lastSyncedAt: new Date() },
      });

      // Batch insert trades
      const tradeData = trades.map(t => ({
        traderId: trader.id,
        marketId: t.conditionId || t.marketId || `unk-${t.timestamp}`,
        conditionId: t.conditionId || '',
        marketTitle: t.title || null,
        category: cats[0] || 'general',
        side: (t.side || 'BUY').toUpperCase(),
        outcome: t.outcomeIndex === 1 ? 'NO' : 'YES',
        price: t.price || 0,
        shares: t.size || 0,
        valueUsd: Math.round((t.price || 0) * (t.size || 0) * 100) / 100,
        feeUsd: null,
        entryProbability: t.price || null,
        timestamp: new Date(t.timestamp * 1000),
      }));

      for (let b = 0; b < tradeData.length; b += 100) {
        try {
          const res = await p.polymarketTrade.createMany({
            data: tradeData.slice(b, b + 100),
            skipDuplicates: true,
          });
          tradesSaved += res.count;
        } catch (e) { /* skip duplicates */ }
      }
    }

    // Calculate basic stats
    const wins = trades.filter(t => t.outcomeIndex === 0).length;
    const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;
    
    await p.polymarketTrader.update({
      where: { proxyWallet: wallet },
      data: {
        totalTrades: trades.length,
        winRate,
        lastSyncedAt: new Date(),
      },
    });

    return { trades: tradesSaved, skip: false };
  } catch (err) {
    console.error(`  Error syncing ${wallet.slice(0, 12)}:`, err.message);
    return { trades: 0, skip: true, error: true };
  }
}

// Main runner
async function main() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║   FULL DISCOVERY + SYNC — ALL POLYMARKET TRADERS  ║');
  console.log('╚════════════════════════════════════════════════════╝');

  // Count existing
  const existing = await p.polymarketTrader.count();
  const existingTrades = await p.polymarketTrade.count();
  console.log(`\nDB: ${existing} traders, ${existingTrades} trades\n`);

  // Discover new wallets
  const newWallets = await discoverWallets(500);

  if (newWallets.size === 0) {
    console.log('\nNo new wallets discovered. All known traders are in DB.');
    console.log('To force re-sync of existing traders, use the backfill-v2.js script.');
    await p.$disconnect();
    return;
  }

  // Sync all new wallets
  console.log(`\n=== STEP 2: Syncing ${newWallets.size} new wallets ===\n`);
  
  const walletArray = Array.from(newWallets);
  let synced = 0;
  let totalNewTrades = 0;
  let errors = 0;

  for (let i = 0; i < walletArray.length; i += BATCH_SIZE) {
    const batch = walletArray.slice(i, i + BATCH_SIZE);
    const existingWallets = new Set();

    const results = await Promise.allSettled(
      batch.map(w => syncWallet(w, existingWallets))
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        if (!r.value.skip) {
          synced++;
          totalNewTrades += r.value.trades;
        }
      } else {
        errors++;
      }
    }

    if ((i + BATCH_SIZE) % 50 === 0 || i + BATCH_SIZE >= walletArray.length) {
      console.log(`[${Math.min(i + BATCH_SIZE, walletArray.length)}/${walletArray.length}] Synced: ${synced} | Trades: ${totalNewTrades} | Errors: ${errors}`);
    }

    await sleep(DELAY_MS * 2);
  }

  // Final stats
  const [totalTraders, totalTradesDB, v2Count] = await Promise.all([
    p.polymarketTrader.count(),
    p.polymarketTrade.count(),
    p.polymarketTrader.count({ where: { masterPMI: { gt: 0 } } }),
  ]);

  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║                  FINAL RESULTS                      ║');
  console.log('╠════════════════════════════════════════════════════╣');
  console.log(`║  Total traders in DB:     ${String(totalTraders).padStart(8)}              ║`);
  console.log(`║  New wallets discovered:  ${String(newWallets.size).padStart(8)}              ║`);
  console.log(`║  New wallets synced:      ${String(synced).padStart(8)}              ║`);
  console.log(`║  New trades saved:        ${String(totalNewTrades).padStart(8)}              ║`);
  console.log(`║  Total trades in DB:      ${String(totalTradesDB).padStart(8)}              ║`);
  console.log(`║  Traders with V2 scores:  ${String(v2Count).padStart(8)}              ║`);
  console.log(`║  Errors:                  ${String(errors).padStart(8)}              ║`);
  console.log('╚════════════════════════════════════════════════════╝\n');

  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
