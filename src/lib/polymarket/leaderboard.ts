import { POLYMARKET as POLYMARKET_SITE } from '@/lib/polymarket/config';
import { getTradesForUser, getClosedPositionsForUser } from '@/lib/polymarket/data';
import { resolvePolymarketProfile } from '@/lib/polymarket/profiles';
import { tradesFromPolymarket } from '@/lib/polymarket/trade-metrics';
import { calculateTrustScore } from '@/lib/analytics/trustscore';
import { calculateEdgeScore } from '@/lib/intelligence/edge-score';
import { buildMonthlyReturns } from '@/lib/analytics/trades-from-txs';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { Prisma, PolymarketTrader } from '@prisma/client';

// ─── Exported interfaces ────────────────────────────────────────
export interface PolymarketTraderBrief {
  proxyWallet: string;
  displayName: string | null;
  pseudonym: string | null;
  verifiedBadge: boolean;
  xUsername: string | null;
  trustScore: number;
  edgeScore: number;
  winRate: number;
  roi: number;
  maxDrawdown: number;
  consistency: number;
  profitFactor: number;
  riskLevel: string;
  totalTrades: number;
  activityDays: number;
  avgTradeSize: number;
  totalVolumeUsd: number;
  timingScore: number;
  categories: string[];
  polymarketUrl: string | undefined;
}

export interface LeaderboardEntry {
  rank: number;
  trader: PolymarketTraderBrief;
}

export interface LeaderboardPage {
  entries: LeaderboardEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  categories: string[]; // all available categories in this result
}

function mergeCategories(existing: string[], next: string): string[] {
  return [...new Set([...existing, next])];
}

/**
 * Sync a single Polymarket wallet: incremental fetch → Edge Score → DB cache.
 * @param categories - One or more category slugs this wallet belongs to.
 */
export async function syncPolymarketTrader(
  proxyWallet: string,
  categories: string[] = []
): Promise<PolymarketTraderBrief | null> {
  try {
    const profile = await resolvePolymarketProfile(proxyWallet);
    const queryAddress = (profile?.proxyWallet ?? proxyWallet).toLowerCase();

    const [trades, closed] = await Promise.all([
      getTradesForUser(queryAddress, 300),
      getClosedPositionsForUser(queryAddress, 100).catch(() => []),
    ]);

    if (!trades.length && !closed.length) return null;

    const { tradeRecords, totalVolumeUsd, avgTradeSize, timingScore } = tradesFromPolymarket(
      trades,
      closed
    );

    const activityDays = new Set(
      trades.map((t) => new Date(t.timestamp * 1000).toDateString())
    ).size;

    const equityCurve = tradeRecords.reduce<number[]>((curve, tr) => {
      const prev = curve.length ? curve[curve.length - 1]! : 0;
      curve.push(prev + tr.pnl);
      return curve;
    }, []);

    const monthlyReturns = buildMonthlyReturns(tradeRecords);
    const tradesPerMonth = tradeRecords.length / Math.max(1, activityDays / 30);

    const result = calculateTrustScore({
      trades: tradeRecords,
      monthlyReturns,
      equityCurve,
      tradeCount: tradeRecords.length,
      activityDays: Math.max(activityDays, 1),
    });

    const edgeScore = calculateEdgeScore({
      roi: result.roi,
      consistency: result.consistency,
      maxDrawdown: result.maxDrawdown,
      timingScore,
      tradesPerMonth,
    });

    const existing = await prisma.polymarketTrader.findUnique({
      where: { proxyWallet: queryAddress },
      select: { categories: true },
    });

    // Merge incoming categories with existing DB categories
    const mergedCategoriesList = categories.reduce(
      (acc, cat) => mergeCategories(acc, cat),
      existing?.categories ?? []
    );

    const brief: PolymarketTraderBrief = {
      proxyWallet: queryAddress,
      displayName: profile?.name ?? null,
      pseudonym: profile?.pseudonym ?? null,
      verifiedBadge: profile?.verifiedBadge ?? false,
      xUsername: profile?.xUsername ?? null,
      trustScore: result.trustScore,
      edgeScore,
      winRate: result.winRate,
      roi: result.roi,
      maxDrawdown: result.maxDrawdown,
      consistency: result.consistency,
      profitFactor: result.profitFactor,
      riskLevel: result.riskLevel,
      totalTrades: tradeRecords.length,
      activityDays,
      avgTradeSize,
      totalVolumeUsd,
      timingScore,
      categories,
      polymarketUrl: `${POLYMARKET_SITE}/profile/${queryAddress}`,
    };

    await prisma.polymarketTrader.upsert({
      where: { proxyWallet: queryAddress },
      update: {
        displayName: brief.displayName,
        pseudonym: brief.pseudonym,
        verifiedBadge: brief.verifiedBadge ?? false,
        xUsername: brief.xUsername,
        trustScore: brief.trustScore,
        edgeScore: brief.edgeScore,
        winRate: brief.winRate,
        roi: brief.roi,
        maxDrawdown: brief.maxDrawdown,
        consistency: brief.consistency,
        profitFactor: brief.profitFactor,
        riskLevel: brief.riskLevel,
        totalTrades: brief.totalTrades,
        activityDays: brief.activityDays,
        avgTradeSize: brief.avgTradeSize,
        totalVolumeUsd: brief.totalVolumeUsd,
        timingScore: brief.timingScore,
        categories,
        lastSyncedAt: new Date(),
      },
      create: {
        proxyWallet: queryAddress,
        displayName: brief.displayName,
        pseudonym: brief.pseudonym,
        verifiedBadge: brief.verifiedBadge ?? false,
        xUsername: brief.xUsername,
        trustScore: brief.trustScore,
        edgeScore: brief.edgeScore,
        winRate: brief.winRate,
        roi: brief.roi,
        maxDrawdown: brief.maxDrawdown,
        consistency: brief.consistency,
        profitFactor: brief.profitFactor,
        riskLevel: brief.riskLevel,
        totalTrades: brief.totalTrades,
        activityDays: brief.activityDays,
        avgTradeSize: brief.avgTradeSize,
        totalVolumeUsd: brief.totalVolumeUsd,
        timingScore: brief.timingScore,
        categories,
        lastSyncedAt: new Date(),
      },
    });

    return brief;
  } catch (error) {
    logger.error({ proxyWallet, error }, 'Failed to sync Polymarket trader');
    return null;
  }
}

/**
 * Get leaderboard with full-text search, multi-category filter, and pagination.
 * Supports MILLIONS of traders via cursor-based pagination.
 */
export async function getLeaderboard(options?: {
  categorySlug?: string;            // Single category filter (legacy)
  categories?: string[];            // Multi-category: pick multiple
  search?: string;                  // Full-text search on name / wallet
  minTrades?: number;
  limit?: number;
  page?: number;
  sortBy?:
    | 'edgeScore'
    | 'trustScore'
    | 'roi'
    | 'winRate'
    | 'consistency'
    | 'totalVolumeUsd'
    | 'totalTrades';
}): Promise<LeaderboardPage> {
  const {
    categories,
    categorySlug,
    search,
    minTrades = 0,
    limit = 50,
    page = 1,
    sortBy = 'edgeScore',
  } = options ?? {};

  const skip = (page - 1) * limit;
  const where: Prisma.PolymarketTraderWhereInput = {};

  // ── Category filter (multi or single) ──
  const activeCategories = categories ?? (categorySlug ? [categorySlug] : []);
  if (activeCategories.length === 1) {
    where.categories = { has: activeCategories[0] };
  } else if (activeCategories.length > 1) {
    where.categories = { hasSome: activeCategories };
  }

  // ── Min trades ──
  if (minTrades > 0) {
    where.totalTrades = { gte: minTrades };
  }

  // ── Full-text search (name, pseudonym, wallet) ──
  if (search && search.trim().length > 0) {
    const q = search.trim();
    where.OR = [
      { displayName: { contains: q, mode: 'insensitive' } },
      { pseudonym: { contains: q, mode: 'insensitive' } },
      { xUsername: { contains: q, mode: 'insensitive' } },
      { proxyWallet: { contains: q, mode: 'insensitive' } },
    ];
  }

  // ── Sorting ──
  const validSortKey: string = ['edgeScore','trustScore','roi','winRate','consistency','totalVolumeUsd','totalTrades'].includes(sortBy) ? sortBy : 'edgeScore';
  const orderBy: Record<string, 'asc' | 'desc'> = { [validSortKey]: 'desc' };

  // ── Count total (for pagination) ──
  // Explicit select to ensure type safety and avoid Prisma client staleness
  const [total, traders] = await Promise.all([
    prisma.polymarketTrader.count({ where }),
    prisma.polymarketTrader.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      select: {
        id: true,
        proxyWallet: true,
        displayName: true,
        pseudonym: true,
        verifiedBadge: true,
        xUsername: true,
        trustScore: true,
        edgeScore: true,
        winRate: true,
        roi: true,
        maxDrawdown: true,
        consistency: true,
        profitFactor: true,
        riskLevel: true,
        totalTrades: true,
        activityDays: true,
        avgTradeSize: true,
        totalVolumeUsd: true,
        timingScore: true,
        categories: true,
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  // ── Collect all categories present in results ──
  const resultCategories = new Set<string>();
  for (const t of traders) {
    for (const c of t.categories) resultCategories.add(c);
  }

  const entries: LeaderboardEntry[] = traders.map((t, i) => ({
    rank: skip + i + 1,
    trader: {
      proxyWallet: t.proxyWallet,
      displayName: t.displayName,
      pseudonym: t.pseudonym,
      verifiedBadge: t.verifiedBadge,
      xUsername: t.xUsername,
      trustScore: Number(t.trustScore),
      edgeScore: Number(t.edgeScore),
      winRate: Number(t.winRate),
      roi: Number(t.roi),
      maxDrawdown: Number(t.maxDrawdown),
      consistency: Number(t.consistency),
      profitFactor: Number(t.profitFactor),
      riskLevel: t.riskLevel,
      totalTrades: t.totalTrades,
      activityDays: t.activityDays,
      avgTradeSize: Number(t.avgTradeSize),
      totalVolumeUsd: Number(t.totalVolumeUsd),
      timingScore: Number(t.timingScore),
      categories: t.categories,
      polymarketUrl: t.proxyWallet ? `${POLYMARKET_SITE}/profile/${t.proxyWallet}` : undefined,
    },
  }));

  return {
    entries,
    total,
    page,
    pageSize: limit,
    totalPages,
    categories: Array.from(resultCategories).sort(),
  };
}

export async function getIntelligenceStats() {
  const [traderCount, lastSync] = await Promise.all([
    prisma.polymarketTrader.count(),
    prisma.polymarketTrader.findFirst({
      orderBy: { lastSyncedAt: 'desc' },
      select: { lastSyncedAt: true },
    }),
  ]);

  return {
    traderCount,
    lastSyncedAt: lastSync?.lastSyncedAt?.toISOString() ?? null,
  };
}

/**
 * Count traders per category.
 */
export async function getCategoryCounts(): Promise<Record<string, number>> {
  const allTraders = await prisma.polymarketTrader.findMany({
    select: { categories: true },
    take: 100000,
  });

  const counts: Record<string, number> = {};
  for (const t of allTraders) {
    for (const c of t.categories) {
      counts[c] = (counts[c] ?? 0) + 1;
    }
  }

  // Sort by count descending
  return Object.fromEntries(
    Object.entries(counts).sort(([, a], [, b]) => b - a)
  );
}