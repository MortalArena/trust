/**
 * Full Trader Discovery + Sync Engine
 * 
 * Phase 1: Discover ALL unique trader wallets from Polymarket Data API
 *         by paginating through ALL trades across all active markets
 * Phase 2: For each wallet, fetch COMPLETE trade history from Data API
 * Phase 3: Calculate V2 reputation scores for ALL traders
 * 
 * The key insight: /data-api.polymarket.com/trades returns ALL trades
 * with proxyWallet field. We paginate through millions of trades
 * to discover every unique wallet.
 */

import { DATA } from '@/lib/polymarket/config';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { syncPolymarketTrader } from './leaderboard';

const PAGE_SIZE = 500;
const MAX_DISCOVERY_PAGES = 2000; // 2000 * 500 = 1M trades scanned
const SYNC_BATCH_SIZE = 5;
const SYNC_DELAY_MS = 300; // 300ms between requests to avoid rate limit

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const ctl = new AbortController();
    const id = setTimeout(() => ctl.abort(), 15000);
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    clearTimeout(id);
    if (!r.ok) return null;
    return await r.json() as T;
  } catch { return null; }
}

interface RawTrade {
  proxyWallet: string;
  timestamp: number;
  [key: string]: any;
}

/**
 * Phase 1: Scan ALL trades from Data API to discover every unique wallet
 * This goes through ALL trades (millions) with pagination
 * to build a complete set of known wallets
 */
export async function discoverAllWalletsFromTrades(
  onProgress?: (scanned: number, uniqueWallets: number, page: number) => void
): Promise<Set<string>> {
  const knownWallets = new Set<string>();
  
  logger.info('Discovery Phase 1: Scanning all trades for unique wallets...');

  for (let page = 0; page < MAX_DISCOVERY_PAGES; page++) {
    const offset = page * PAGE_SIZE;
    const url = `${DATA}/trades?limit=${PAGE_SIZE}&offset=${offset}&order=timestamp&ascending=false`;
    
    const data = await fetchJson<any[]>(url);
    
    if (!data || data.length === 0) {
      logger.info(`Discovery: No more trades at page ${page}, stopping`);
      break;
    }

    let newWallets = 0;
    for (const trade of data) {
      if (trade.proxyWallet && trade.proxyWallet.startsWith('0x')) {
        const wallet = trade.proxyWallet.toLowerCase();
        if (!knownWallets.has(wallet)) {
          knownWallets.add(wallet);
          newWallets++;
        }
      }
    }

    if (onProgress) {
      onProgress(offset + data.length, knownWallets.size, page);
    }

    if (page % 50 === 0) {
      logger.info({ page, scanned: offset + data.length, uniqueWallets: knownWallets.size, newWallets }, 'Discovery: Scanning trades...');
    }

    // Polite delay
    await new Promise(r => setTimeout(r, 100));
  }

  logger.info({ totalWallets: knownWallets.size }, 'Discovery Phase 1: Complete');
  return knownWallets;
}

/**
 * Phase 1b: Also discover wallets from active markets 
 * For each active market, fetch its trades and extract wallets
 */
export async function discoverWalletsFromActiveMarkets(
  marketIds: string[],
  onProgress?: (marketIdx: number, total: number, wallets: number) => void
): Promise<Set<string>> {
  const wallets = new Set<string>();
  
  logger.info({ marketsCount: marketIds.length }, 'Discovery Phase 1b: Scanning active markets for wallets...');

  for (let i = 0; i < marketIds.length; i += 10) {
    const batch = marketIds.slice(i, i + 10);
    
    await Promise.allSettled(batch.map(async (marketId) => {
      // Fetch trades for this market
      for (let page = 0; page < 20; page++) {
        const data = await fetchJson<any[]>(
          `${DATA}/trades?condition_id=${encodeURIComponent(marketId)}&limit=100&offset=${page * 100}&order=timestamp&ascending=false`
        );
        if (!data || data.length === 0) break;
        
        for (const trade of data) {
          if (trade.proxyWallet && trade.proxyWallet.startsWith('0x')) {
            wallets.add(trade.proxyWallet.toLowerCase());
          }
        }
      }
    }));

    if (onProgress) {
      onProgress(i + batch.length, marketIds.length, wallets.size);
    }

    await new Promise(r => setTimeout(r, 200));
  }

  logger.info({ wallets: wallets.size }, 'Discovery Phase 1b: Complete');
  return wallets;
}

/**
 * Phase 2: Sync ALL discovered traders with full trade history
 * For each wallet, fetch ALL trades from Data API
 */
export async function syncAllDiscoveredTraders(
  wallets: Set<string>,
  onProgress?: (synced: number, total: number, withScores: number) => void
): Promise<{ synced: number; withScores: number; totalTrades: number }> {
  const walletArray = Array.from(wallets);
  let synced = 0;
  let withScores = 0;
  let totalTrades = 0;

  logger.info({ total: walletArray.length }, 'Sync Phase 2: Starting full sync of all wallets...');

  for (let i = 0; i < walletArray.length; i += SYNC_BATCH_SIZE) {
    const batch = walletArray.slice(i, i + SYNC_BATCH_SIZE);
    
    const results = await Promise.allSettled(
      batch.map(async (wallet) => {
        try {
          const result = await syncPolymarketTrader(wallet, ['all']);
          return { wallet, success: !!result, trades: result?.totalTrades || 0 };
        } catch (err) {
          return { wallet, success: false, trades: 0 };
        }
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value.success) {
          synced++;
          totalTrades += result.value.trades;
        }
      }
    }

    // Check how many have V2 scores
    const scored = await prisma.polymarketTrader.count({
      where: { masterPMI: { gt: 0 } },
    });
    withScores = scored;

    if (onProgress) {
      onProgress(synced, walletArray.length, withScores);
    }

    if ((i + SYNC_BATCH_SIZE) % 100 === 0) {
      logger.info(
        { synced, total: walletArray.length, withScores, totalTrades },
        'Sync Phase 2: Progress...'
      );
    }

    // Polite delay between batches
    await new Promise(r => setTimeout(r, SYNC_DELAY_MS));
  }

  logger.info({ synced, withScores, totalTrades }, 'Sync Phase 2: Complete');
  return { synced, withScores, totalTrades };
}

/**
 * Full discovery + sync pipeline
 * Scan all trades → discover wallets → sync each with full history → calculate V2
 */
export async function runFullDiscoveryAndSync(
  onProgress?: (phase: string, progress: any) => void
) {
  const startTime = Date.now();
  
  // Phase 1a: Scan ALL trades for wallets
  if (onProgress) onProgress('discovery_global', { status: 'starting' });
  const globalWallets = await discoverAllWalletsFromTrades((scanned, wallets, page) => {
    if (onProgress) onProgress('discovery_global', { scanned, wallets, page });
  });

  // Phase 2: Sync all discovered wallets
  if (onProgress) onProgress('sync', { status: 'starting', total: globalWallets.size });
  const result = await syncAllDiscoveredTraders(globalWallets, (synced, total, withScores) => {
    if (onProgress) onProgress('sync', { synced, total, withScores });
  });

  const duration = (Date.now() - startTime) / 1000 / 60;
  
  // Final stats
  const [totalTraders, totalTradesDB, totalWithV2] = await Promise.all([
    prisma.polymarketTrader.count(),
    prisma.polymarketTrade.count(),
    prisma.polymarketTrader.count({ where: { masterPMI: { gt: 0 } } }),
  ]);

  const summary = {
    duration: `${duration.toFixed(1)} minutes`,
    discoveredWallets: globalWallets.size,
    syncedTraders: result.synced,
    totalTradersInDB: totalTraders,
    totalTradesInDB: totalTradesDB,
    tradersWithV2: totalWithV2,
  };

  logger.info(summary, 'Full Discovery + Sync: COMPLETE');
  return summary;
}
