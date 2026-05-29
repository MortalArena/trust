import { listEvents } from '@/lib/polymarket/gamma';
import { dataFetch } from '@/lib/polymarket/client';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';
import type { PolymarketTrade } from '@/lib/polymarket/types';

// ─── Types ──────────────────────────────────────────────────────

export interface PolymarketTraderBrief {
  proxyWallet: string;
  inferredCategory?: string; // Category inferred from event tag during discovery
}

export interface CategoryDiscoveryResult {
  category: string;
  wallets: PolymarketTraderBrief[];
  eventsScanned: number;
  tradesFetched: number;
}

/**
 * Category-to-tag mapping for Polymarket Gamma API discovery.
 * Covers ALL categories and subcategories.
 */
export const CATEGORY_TAG_MAP: Record<string, string[]> = {
  sports:    ['sports', 'nfl', 'nba', 'soccer', 'mlb', 'nhl', 'ufc', 'mma', 'boxing', 'tennis', 'golf', 'cricket'],
  politics:  ['politics', 'us-elections', 'global-elections', 'policy', 'us-politics', 'democrats', 'republicans'],
  crypto:    ['crypto', 'bitcoin', 'ethereum', 'defi', 'nft', 'solana', 'memecoin', 'layer1', 'layer2'],
  'science-tech': ['science', 'technology', 'ai', 'space', 'biotech', 'tech'],
  economics: ['economics', 'finance', 'macro', 'fed', 'equities', 'stock-market'],
  culture:   ['culture', 'entertainment', 'awards', 'box-office', 'music', 'movies', 'celebrity'],
  business:  ['business', 'earnings', 'ipo', 'startups'],
  geopolitics: ['geopolitics', 'diplomacy', 'conflict', 'war', 'international'],
  'climate-weather': ['climate', 'weather', 'natural-disaster', 'environment'],
  esports:   ['esports', 'gaming', 'league-of-legends', 'valorant', 'cs2', 'dota2'],
  'world-events': ['world-events', 'breaking-news', 'viral'],
};

/**
 * Fast path: paginate global recent trades (seconds to thousands of wallets).
 * Polymarket Data API uses `market` (condition id) and returns `proxyWallet`.
 */
export async function discoverFromRecentTrades(options?: {
  maxWallets?: number;
  pageSize?: number;
  maxPages?: number;
  inferredCategory?: string;
}): Promise<PolymarketTraderBrief[]> {
  const maxWallets = options?.maxWallets ?? 3000;
  const pageSize = Math.min(options?.pageSize ?? 100, 100);
  const maxPages = options?.maxPages ?? 40;
  const wallets = new Set<string>();
  const inferred = options?.inferredCategory;

  for (let page = 0; page < maxPages && wallets.size < maxWallets; page++) {
    try {
      const trades = await dataFetch<PolymarketTrade[]>(`/trades`, {
        limit: pageSize,
        offset: page * pageSize,
        takerOnly: false,
      });
      if (!trades.length) break;
      for (const t of trades) {
        const w = t.proxyWallet?.toLowerCase();
        if (w && w.length === 42 && w.startsWith('0x')) wallets.add(w);
        if (wallets.size >= maxWallets) break;
      }
      if (trades.length < pageSize) break;
    } catch (error) {
      logger.warn({ page, error }, 'Recent trades discovery page failed');
      break;
    }
  }

  return Array.from(wallets).map((proxyWallet) => ({ proxyWallet, inferredCategory: inferred }));
}

async function fetchTradesByCondition(conditionId: string, limit = 100): Promise<PolymarketTrade[]> {
  try {
    return await dataFetch<PolymarketTrade[]>(`/trades`, {
      market: conditionId,
      limit,
      takerOnly: false,
    });
  } catch {
    return [];
  }
}

/**
 * Massive Discovery — fetches ALL traders from ALL active Polymarket events.
 * No artificial limits. Uses batching and pagination for scale.
 * 
 * Returns an array of unique proxy wallet addresses found.
 * Each wallet carries the category it was discovered from.
 */
export async function discoverAllPolymarketTraders(options?: {
  maxWallets?: number;
  maxEventsPerTag?: number;
  skipRecentTrades?: boolean;
}): Promise<PolymarketTraderBrief[]> {
  const maxWallets = options?.maxWallets ?? 50000;
  const maxEventsPerTag = options?.maxEventsPerTag ?? 100;
  const walletToCategory = new Map<string, string>(); // wallet → category

  // Load existing wallets from DB
  const existingInDb = await prisma.polymarketTrader.findMany({
    select: { proxyWallet: true, categories: true },
    take: 50000,
  });
  for (const t of existingInDb) {
    if (t.categories.length > 0) {
      walletToCategory.set(t.proxyWallet, t.categories[0]);
    } else {
      walletToCategory.set(t.proxyWallet, 'general');
    }
  }

  if (!options?.skipRecentTrades) {
    const recent = await discoverFromRecentTrades({
      maxWallets: Math.min(maxWallets, 5000),
    });
    for (const { proxyWallet } of recent) {
      if (!walletToCategory.has(proxyWallet)) {
        walletToCategory.set(proxyWallet, 'general');
      }
    }
    logger.info({ fromRecentTrades: recent.length, total: walletToCategory.size }, 'Recent trades discovery');
  }

  // Loop through ALL category tags
  const categoryEntries = Object.entries(CATEGORY_TAG_MAP);
  logger.info({ totalTags: categoryEntries.reduce((s, [, v]) => s + v.length, 0) }, 'Starting mass discovery');

  for (const [category, tagSlugs] of categoryEntries) {
    for (const tagSlug of tagSlugs) {
      if (walletToCategory.size >= maxWallets) break;

      try {
        const events = await listEvents({
          tag_slug: tagSlug,
          limit: maxEventsPerTag,
          active: true,
          closed: false,
          order: 'volume24hr',
          ascending: false,
        });

        for (const event of events) {
          if (walletToCategory.size >= maxWallets) break;

          const conditions = event.markets
            ?.map(m => m.conditionId)
            .filter((c): c is string => Boolean(c))
            ?? [];

          for (const conditionId of conditions) {
            if (walletToCategory.size >= maxWallets) break;

            const trades = await fetchTradesByCondition(conditionId, 100);
            for (const trade of trades) {
              const wallet = trade.proxyWallet?.toLowerCase();
              if (wallet && wallet.length === 42) {
                // Assign category ONLY if wallet doesn't have one yet (keep first discovered category)
                if (!walletToCategory.has(wallet) || walletToCategory.get(wallet) === 'general') {
                  walletToCategory.set(wallet, category);
                } else if (!walletToCategory.has(wallet)) {
                  walletToCategory.set(wallet, category);
                }
              }
              if (walletToCategory.size >= maxWallets) break;
            }
          }
        }
      } catch {
        // Skip failed tag
      }
    }
    if (walletToCategory.size >= maxWallets) break;
  }

  const discovered = Array.from(walletToCategory.entries())
    .filter(([w]) => w && w.length > 10)
    .map(([proxyWallet, inferredCategory]) => ({ proxyWallet, inferredCategory }));

  logger.info({ total: discovered.length }, 'Mass discovery complete');
  return discovered;
}

/**
 * Discover traders per category by scanning event tags.
 * Returns a Map of category → wallets for accurate categorization.
 */
export async function discoverByCategory(options?: {
  maxEventsPerTag?: number;
}): Promise<Map<string, PolymarketTraderBrief[]>> {
  const maxEventsPerTag = options?.maxEventsPerTag ?? 50;
  const result = new Map<string, PolymarketTraderBrief[]>();

  const categoryEntries = Object.entries(CATEGORY_TAG_MAP);

  for (const [category, tagSlugs] of categoryEntries) {
    const wallets = new Set<string>();

    for (const tagSlug of tagSlugs) {
      try {
        const events = await listEvents({
          tag_slug: tagSlug,
          limit: maxEventsPerTag,
          active: true,
          closed: false,
          order: 'volume24hr',
          ascending: false,
        });

        for (const event of events) {
          const conditions = event.markets
            ?.map(m => m.conditionId)
            .filter((c): c is string => Boolean(c))
            ?? [];

          for (const conditionId of conditions) {
            const trades = await fetchTradesByCondition(conditionId, 50);
            for (const trade of trades) {
              const wallet = trade.proxyWallet?.toLowerCase();
              if (wallet && wallet.length === 42) wallets.add(wallet);
            }
          }
        }
      } catch {
        // Skip failed tag
      }
    }

    if (wallets.size > 0) {
      result.set(category, Array.from(wallets).map((w) => ({ proxyWallet: w, inferredCategory: category })));
      logger.info({ category, wallets: wallets.size }, 'Category discovery done');
    }
  }

  return result;
}

/**
 * Bulk-import discovered wallets into DB using batch inserts.
 * Skips duplicates and assigns categories.
 */
export async function bulkImportDiscoveredTraders(
  traders: PolymarketTraderBrief[]
): Promise<{ imported: number; skipped: number }> {
  let imported = 0;
  let skipped = 0;

  // Batch in groups of 50 for performance
  const batchSize = 50;
  for (let i = 0; i < traders.length; i += batchSize) {
    const batch = traders.slice(i, i + batchSize);
    const data = batch.map(t => ({
      proxyWallet: t.proxyWallet,
      categories: t.inferredCategory ? [t.inferredCategory] : [],
      totalTrades: 0,
      lastSyncedAt: new Date(0), // Force sync on next cron
    }));

    try {
      const result = await prisma.polymarketTrader.createMany({
        data,
        skipDuplicates: true,
      });
      imported += result.count;
      skipped += batch.length - result.count;
    } catch (error: unknown) {
      // Fall back to individual inserts for error recovery
      for (const trader of batch) {
        try {
          await prisma.polymarketTrader.create({
            data: {
              proxyWallet: trader.proxyWallet,
              categories: trader.inferredCategory ? [trader.inferredCategory] : [],
              totalTrades: 0,
              lastSyncedAt: new Date(0),
            },
          });
          imported++;
        } catch {
          skipped++;
        }
      }
    }
  }

  logger.info({ imported, skipped }, 'Bulk import complete');
  return { imported, skipped };
}

/**
 * Fast discovery: recent global trades + category scan (~2 min). Saves categories on import.
 */
export async function discoverAndImportFast(maxWallets = 2500): Promise<{
  discovered: number;
  imported: number;
  skipped: number;
  note: string;
}> {
  // Phase 1: Recent trades (no category)
  const recent = await discoverFromRecentTrades({ maxWallets: Math.min(maxWallets, 1000) });

  // Phase 2: Discover by category (preserves categories)
  const byCategory = await discoverByCategory({ maxEventsPerTag: 30 });

  // Merge: recent gets 'general', category wallets keep their inferred category
  const seen = new Set<string>();
  const merged: PolymarketTraderBrief[] = [];

  for (const t of recent) {
    if (!seen.has(t.proxyWallet)) {
      seen.add(t.proxyWallet);
      merged.push(t);
    }
  }

  for (const [, wallets] of byCategory) {
    for (const w of wallets) {
      if (!seen.has(w.proxyWallet)) {
        seen.add(w.proxyWallet);
        merged.push(w);
      }
    }
  }

  // Limit
  const limited = merged.slice(0, maxWallets);

  const { imported, skipped } = await bulkImportDiscoveredTraders(limited);
  return {
    discovered: limited.length,
    imported,
    skipped,
    note: `Imported ${imported} wallets (${recent.length} recent trades + categories). Cron syncs scores.`,
  };
}

export async function discoverAndImportAll(categorySlug?: string): Promise<{
  discovered: number;
  imported: number;
  skipped: number;
  note: string;
}> {
  logger.info({ categorySlug }, 'Starting full Polymarket trader discovery...');

  const traders = await discoverAllPolymarketTraders();

  const { imported, skipped } = await bulkImportDiscoveredTraders(traders);

  return {
    discovered: traders.length,
    imported,
    skipped,
    note: `Scanned recent trades + events. Found ${traders.length} unique wallets. Imported ${imported} new. Re-run via cron every 5 minutes.`,
  };
}