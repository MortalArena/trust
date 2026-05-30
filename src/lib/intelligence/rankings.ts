import { prisma } from '@/lib/db';
import type { LeaderboardEntry } from '@/lib/polymarket/leaderboard';
import type { RankingBoardId } from './edge-score';

function asJsonPayload(entries: LeaderboardEntry[]): object {
  return JSON.parse(JSON.stringify(entries));
}

async function topTraders(
  where: Record<string, unknown>,
  orderBy: Record<string, 'desc' | 'asc'>,
  limit: number
): Promise<LeaderboardEntry[]> {
  const rows = await prisma.polymarketTrader.findMany({
    where: { totalTrades: { gte: 5 }, ...where },
    orderBy,
    take: limit,
  });

  return rows.map((t, i) => ({
    rank: i + 1,
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
      polymarketUrl: `https://polymarket.com/profile/${t.proxyWallet}`,
      lastSyncedAt: t.lastSyncedAt.toISOString(),
    },
  }));
}

/** Recompute all ranking boards and cache in IntelligenceRanking */
export async function refreshPrecomputedRankings(): Promise<Record<string, number>> {
  const boards: { board: RankingBoardId; where?: Record<string, unknown>; orderBy: Record<string, 'desc' | 'asc'> }[] = [
    { board: 'top_edge', orderBy: { edgeScore: 'desc' } },
    { board: 'highest_roi_30d', orderBy: { roi: 'desc' } },
    { board: 'best_win_rate', where: { totalTrades: { gte: 20 } }, orderBy: { winRate: 'desc' } },
    { board: 'most_consistent', orderBy: { consistency: 'desc' } },
    { board: 'smart_money_volume', orderBy: { totalVolumeUsd: 'desc' } },
    { board: 'top_trust', orderBy: { trustScore: 'desc' } },
    { board: 'best_profit_factor', where: { totalTrades: { gte: 10 } }, orderBy: { profitFactor: 'desc' } },
    { board: 'lowest_risk', where: { totalTrades: { gte: 10 }, roi: { gt: 0 } }, orderBy: { maxDrawdown: 'asc' } },
  ];

  const counts: Record<string, number> = {};

  for (const { board, where = {}, orderBy } of boards) {
    try {
      const entries = await topTraders(where, orderBy, 100);
      await prisma.intelligenceRanking.upsert({
        where: {
          board_categorySlug: { board, categorySlug: '' },
        },
        update: {
          payload: asJsonPayload(entries),
          traderCount: entries.length,
          computedAt: new Date(),
        },
        create: {
          board,
          categorySlug: '',
          payload: asJsonPayload(entries),
          traderCount: entries.length,
        },
      });
      counts[board] = entries.length;
    } catch (error) {
      console.error(`Failed to refresh board ${board}:`, error);
      counts[board] = 0;
    }
  }

  return counts;
}

export async function getPrecomputedRanking(
  board: string,
  categorySlug?: string
): Promise<{ entries: LeaderboardEntry[]; computedAt: string | null }> {
  const row = await prisma.intelligenceRanking.findUnique({
    where: {
      board_categorySlug: { board, categorySlug: categorySlug ?? '' },
    },
  });

  if (!row) return { entries: [], computedAt: null };
  return {
    entries: row.payload as unknown as LeaderboardEntry[],
    computedAt: row.computedAt.toISOString(),
  };
}
