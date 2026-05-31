/**
 * MASS DISCOVERY — Pull ALL traders from Polymarket
 * 
 * Key insight: The Data API has offset limits (~3000 max).
 * Solution: Use timestamp-based pagination.
 * Start from now and go backwards in time chunks.
 * Also: Query per-condition_id for each active market.
 * 
 * This script will discover EVERY wallet that has EVER
 * traded on Polymarket, going back years.
 */

const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const DATA = 'https://data-api.polymarket.com';
const GAMMA = 'https://gamma-api.polymarket.com';
const PAGE_SIZE = 100;
const DELAY_MS = 150;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJSON(url, retries = 5) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const ctl = new AbortController();
      const id = setTimeout(() => ctl.abort(), 20000);
      const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
      clearTimeout(id);
      if (r.status === 429) {
        const wait = 3000 * (attempt + 1) + Math.random() * 2000;
        console.log(`  Rate limited, waiting ${Math.round(wait/1000)}s...`);
        await sleep(wait);
        continue;
      }
      if (r.status === 400) return null; // offset limit reached
      if (!r.ok) return null;
      const text = await r.text();
      if (!text || text.length === 0) return null;
      return JSON.parse(text);
    } catch (e) {
      if (attempt < retries - 1) await sleep(1000 * (attempt + 1));
      else return null;
    }
  }
  return null;
}

/**
 * Method 1: Timestamp-based pagination
 * Go backwards from now in 24h chunks
 * This bypasses the offset limit
 */
async function discoverByTimestamp(
  startTimestamp, // unix timestamp in seconds
  endTimestamp,   // unix timestamp in seconds
  existingWallets,
  maxChunks = 1000
) {
  const newWallets = new Set();
  let totalScanned = 0;
  let chunkSize = 24 * 3600; // 24 hours in seconds

  console.log(`\nTimestamp method: ${new Date(startTimestamp * 1000).toISOString()} → ${new Date(endTimestamp * 1000).toISOString()}`);

  let currentEnd = startTimestamp;
  let chunk = 0;

  for (; chunk < maxChunks && currentEnd > endTimestamp; chunk++) {
    const currentStart = Math.max(currentEnd - chunkSize, endTimestamp);

    // Fetch trades in this time window
    let pageInChunk = 0;
    let lastTimestamp = null;

    for (let page = 0; page < 50; page++) {
      let url;
      if (lastTimestamp) {
        // Use gt/lt for pagination
        url = `${DATA}/trades?limit=${PAGE_SIZE}&timestamp_gt=${currentStart}&timestamp_lt=${currentEnd}&order=timestamp&ascending=false`;
      } else {
        url = `${DATA}/trades?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}&timestamp_gt=${currentStart}&timestamp_lt=${currentEnd}&order=timestamp&ascending=false`;
      }

      const data = await fetchJSON(url);
      if (!data || data.length === 0) break;

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
        lastTimestamp = trade.timestamp;
      }

      if (chunk % 50 === 0 && page === 0) {
        console.log(`  [Chunk ${chunk}] ${new Date(currentStart * 1000).toISOString().slice(0, 10)} | New: ${newWallets.size} (+${newInPage}) | Scanned: ${totalScanned}`);
      }

      await sleep(DELAY_MS);
    }

    currentEnd = currentStart;
  }

  console.log(`Timestamp method: ${newWallets.size} new wallets from ${totalScanned} trades`);
  return { wallets: newWallets, scanned: totalScanned };
}

/**
 * Method 2: Per-market discovery
 * For each active market, fetch ALL its trades
 * This catches traders in markets that might be missed
 * by the global timestamp method
 */
async function discoverByMarkets(maxMarkets = 500) {
  console.log('\nMarket-based discovery: Fetching active markets...');

  const newWallets = new Set();
  let totalScanned = 0;

  // Fetch active markets
  const markets = await fetchJSON(`${GAMMA}/markets?limit=500&active=true&closed=false&order=volume24hr&ascending=false`);
  if (!markets || markets.length === 0) {
    console.log('No markets found');
    return { wallets: newWallets, scanned: 0 };
  }

  console.log(`Found ${markets.length} active markets. Scanning trades...`);

  // For each market, fetch trades
  for (let i = 0; i < Math.min(markets.length, maxMarkets); i++) {
    const market = markets[i];
    const conditionId = market.conditionId;
    if (!conditionId) continue;

    // Fetch trades for this market
    for (let page = 0; page < 20; page++) {
      const url = `${DATA}/trades?limit=100&condition_id=${encodeURIComponent(conditionId)}&offset=${page * 100}&order=timestamp&ascending=false`;
      const data = await fetchJSON(url);
      if (!data || data.length === 0) break;

      totalScanned += data.length;

      for (const trade of data) {
        if (trade.proxyWallet && trade.proxyWallet.startsWith('0x')) {
          const w = trade.proxyWallet.toLowerCase();
          newWallets.add(w);
        }
      }

      await sleep(100);
    }

    if ((i + 1) % 100 === 0) {
      console.log(`  [${i + 1}/${Math.min(markets.length, maxMarkets)}] Market trades scanned: ${totalScanned} | Unique wallets: ${newWallets.size}`);
    }
  }

  console.log(`Market method: ${newWallets.size} unique wallets from ${totalScanned} trades`);
  return { wallets: newWallets, scanned: totalScanned };
}

/**
 * Method 3: Whale trades — fetch the largest trades
 * Big traders often have large positions
 */
async function discoverWhales() {
  console.log('\nWhale discovery: Fetching large trades...');

  const newWallets = new Set();
  let totalScanned = 0;

  // Fetch trades sorted by size (large first)
  for (let page = 0; page < 100; page++) {
    const url = `${DATA}/trades?limit=100&offset=${page * 100}&order=size&ascending=false&minSize=1000`;
    const data = await fetchJSON(url);
    if (!data || data.length === 0) break;

    totalScanned += data.length;

    for (const trade of data) {
      if (trade.proxyWallet && trade.proxyWallet.startsWith('0x')) {
        newWallets.add(trade.proxyWallet.toLowerCase());
      }
    }

    if ((page + 1) % 20 === 0) {
      console.log(`  [Page ${page + 1}] Scanned: ${totalScanned} | Unique whales: ${newWallets.size}`);
    }

    await sleep(DELAY_MS);
  }

  console.log(`Whale method: ${newWallets.size} unique wallets from ${totalScanned} trades`);
  return { wallets: newWallets, scanned: totalScanned };
}

/**
 * Sync all discovered wallets with complete history
 */
async function syncWallets(wallets, label = '') {
  const walletArray = Array.from(wallets);
  if (walletArray.length === 0) return;

  console.log(`\nSyncing ${walletArray.length} wallets${label}...`);

  let synced = 0;
  let totalTrades = 0;
  const BATCH_SIZE = 3;

  for (let i = 0; i < walletArray.length; i += BATCH_SIZE) {
    const batch = walletArray.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(batch.map(async (wallet) => {
      try {
        // Fetch all trades for this wallet
        const allTrades = [];
        for (let page = 0; page < 50; page++) {
          const data = await fetchJSON(
            `${DATA}/trades?limit=100&offset=${page * 100}&user=${wallet}&order=timestamp&ascending=false`
          );
          if (!data || data.length === 0) break;
          allTrades.push(...data);
          if (data.length < 100) break;
          await sleep(100);
        }

        if (allTrades.length === 0) return { trades: 0, skip: true };

        // Determine categories
        const categories = new Set();
        for (const t of allTrades) {
          const title = (t.title || '').toLowerCase();
          if (title.match(/election|trump|biden|politic|vote|democrat|republican|government|policy/)) categories.add('politics');
          else if (title.match(/btc|bitcoin|eth|crypto|solana|defi|nft|web3|token|coin/)) categories.add('crypto');
          else if (title.match(/nfl|nba|soccer|football|sport|game|match|playoff|final|ufc|mma|esports/)) categories.add('sports');
          else if (title.match(/fed|rate|inflation|gdp|stock|market|econom|recession|macro/)) categories.add('economics');
          else if (title.match(/movie|music|award|oscar|grammy|entertainment|celebrity|film/)) categories.add('culture');
          else if (title.match(/war|geopolit|conflict|russia|ukraine|china|diplomacy|israel|iran/)) categories.add('politics');
          else if (title.match(/ai|tech|space|nasa|science|biotech|innovation|research/)) categories.add('science');
          else if (title.match(/ipo|startup|merger|earning|business|corporate|company/)) categories.add('business');
        }
        const cats = categories.size > 0 ? Array.from(categories) : ['general'];

        // Upsert trader
        const trader = await p.polymarketTrader.upsert({
          where: { proxyWallet: wallet },
          update: { categories: cats, lastSyncedAt: new Date() },
          create: { proxyWallet: wallet, categories: cats, lastSyncedAt: new Date() },
        });

        // Save trades in batches
        let saved = 0;
        const tradeData = allTrades.map(t => ({
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
            saved += res.count;
          } catch (e) { /* skip duplicates */ }
        }

        // Update stats
        const wins = allTrades.filter(t => t.outcomeIndex === 0).length;
        await p.polymarketTrader.update({
          where: { proxyWallet: wallet },
          data: { totalTrades: allTrades.length, winRate: allTrades.length > 0 ? (wins / allTrades.length) * 100 : 0 },
        });

        return { trades: saved, skip: false };
      } catch (err) {
        return { trades: 0, skip: true, error: true };
      }
    }));

    for (const r of results) {
      if (r.status === 'fulfilled' && !r.value.skip) {
        synced++;
        totalTrades += r.value.trades || 0;
      }
    }

    if ((i + BATCH_SIZE) % 30 === 0 || i + BATCH_SIZE >= walletArray.length) {
      console.log(`  [${Math.min(i + BATCH_SIZE, walletArray.length)}/${walletArray.length}] Synced: ${synced} | Trades: ${totalTrades}`);
    }

    await sleep(DELAY_MS * 2);
  }

  console.log(`Sync complete: ${synced} wallets, ${totalTrades} trades`);
}

// ── MAIN ──
async function main() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║      MASS DISCOVERY — ALL POLYMARKET TRADERS      ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  const [existingTraders, existingTrades] = await Promise.all([
    p.polymarketTrader.count(),
    p.polymarketTrade.count(),
  ]);
  console.log(`DB: ${existingTraders} traders, ${existingTrades} trades\n`);

  const allWallets = new Set(
    (await p.polymarketTrader.findMany({ select: { proxyWallet: true } })).map(t => t.proxyWallet)
  );

  // Method 1: Timestamp-based (go back 30 days in chunks)
  // console.log('── Method 1: Timestamp-based discovery ──');
  // const now = Math.floor(Date.now() / 1000);
  // const thirtyDaysAgo = now - 30 * 24 * 3600;
  // const tsResult = await discoverByTimestamp(now, thirtyDaysAgo, allWallets);
  // for (const w of tsResult.wallets) allWallets.add(w);

  // Method 2: Per-market discovery (most thorough)
  console.log('── Method 2: Per-market discovery (ALL active markets) ──');
  const marketResult = await discoverByMarkets(500);
  for (const w of marketResult.wallets) allWallets.add(w);

  // Method 3: Whale trades
  console.log('── Method 3: Whale discovery ──');
  const whaleResult = await discoverWhales();
  for (const w of whaleResult.wallets) allWallets.add(w);

  const existingSet = new Set(
    (await p.polymarketTrader.findMany({ select: { proxyWallet: true } })).map(t => t.proxyWallet)
  );
  const trulyNew = new Set();
  for (const w of allWallets) {
    if (!existingSet.has(w)) trulyNew.add(w);
  }

  console.log(`\n═══ DISCOVERY RESULTS ═══`);
  console.log(`Total unique wallets found: ${allWallets.size}`);
  console.log(`Already in DB: ${existingSet.size}`);
  console.log(`NEW wallets to sync: ${trulyNew.size}`);

  const [finalTraders, finalTrades] = await Promise.all([
    p.polymarketTrader.count(),
    p.polymarketTrade.count(),
  ]);

  console.log(`\n═══ FINAL DB STATE ═══`);
  console.log(`Traders: ${finalTraders}`);
  console.log(`Trades: ${finalTrades}`);

  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
