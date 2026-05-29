import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getCategoryCounts } from '@/lib/polymarket/leaderboard';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/stats
 * Returns system stats for the admin dashboard.
 */
export async function GET() {
  try {
    const [traderCount, scored, synced, lastSync, growthRaw] = await Promise.all([
      prisma.polymarketTrader.count(),
      prisma.polymarketTrader.count({ where: { totalTrades: { gt: 0 } } }),
      prisma.polymarketTrader.count({
        where: { lastSyncedAt: { gt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      }),
      prisma.polymarketTrader.findFirst({
        orderBy: { lastSyncedAt: 'desc' },
        select: { lastSyncedAt: true },
      }),
      prisma.polymarketTrader.groupBy({
        by: ['createdAt'],
        _count: { id: true },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    ]);

    const categoryCounts = await getCategoryCounts();

    // Build growth array from groupBy
    const growthMap = new Map<string, number>();
    for (const g of growthRaw) {
      const date = g.createdAt.toISOString().slice(0, 10);
      growthMap.set(date, (growthMap.get(date) ?? 0) + g._count.id);
    }

    // Accumulate
    const traderGrowth: { date: string; count: number }[] = [];
    let runningTotal = 0;
    const sortedDates = Array.from(growthMap.keys()).sort();
    for (const date of sortedDates) {
      runningTotal += growthMap.get(date) ?? 0;
      traderGrowth.push({ date, count: runningTotal });
    }

    const stats = {
      traderCount,
      scored,
      synced,
      lastSyncAt: lastSync?.lastSyncedAt?.toISOString() ?? null,
      categoryCounts,
      recentActivity: [] as Array<{ action: string; timestamp: string; details?: string }>,
      system: {
        uptime:
          process.uptime() > 86400
            ? `${(process.uptime() / 86400).toFixed(1)}d`
            : `${(process.uptime() / 3600).toFixed(1)}h`,
        dbSize: `${traderCount} records`,
        traderGrowth,
      },
    };

    return NextResponse.json(stats);
  } catch (error) {
    logger.error({ error }, 'Admin stats failed');
    return NextResponse.json({ error: 'Failed to load stats' }, { status: 500 });
  }
}
