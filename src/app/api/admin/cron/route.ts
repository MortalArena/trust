import { NextRequest, NextResponse } from 'next/server';
import { syncPolymarketTrader } from '@/lib/polymarket/leaderboard';
import { discoverAndImportFast } from '@/lib/polymarket/discovery';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET /api/admin/cron?task=refresh-leaderboard
 * Manual cron trigger for admin dashboard.
 */
export async function GET(req: NextRequest) {
  const task = req.nextUrl.searchParams.get('task');

  try {
    if (task === 'refresh-leaderboard') {
      // Phase 1: Discover
      const discovery = await discoverAndImportFast(500);

      // Phase 2: Sync unsynced
      const unsynced = await prisma.polymarketTrader.findMany({
        where: {
          OR: [
            { lastSyncedAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } },
            { totalTrades: 0 },
          ],
        },
        take: 50,
        orderBy: { lastSyncedAt: 'asc' },
      });

      let synced = 0;
      let failed = 0;

      for (let i = 0; i < unsynced.length; i += 5) {
        const batch = unsynced.slice(i, i + 5);
        const results = await Promise.allSettled(
          batch.map((trader) =>
            syncPolymarketTrader(trader.proxyWallet, trader.categories.length > 0 ? trader.categories : ['general'])
          )
        );
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value) synced++;
          else failed++;
        }
      }

      return NextResponse.json({
        success: true,
        task: 'refresh-leaderboard',
        discovery,
        sync: { attempted: unsynced.length, synced, failed },
      });
    }

    if (task === 'populate') {
      const result = await discoverAndImportFast(1500);
      return NextResponse.json({ success: true, task: 'populate', ...result });
    }

    if (task === 'stats') {
      const count = await prisma.polymarketTrader.count();
      const scored = await prisma.polymarketTrader.count({ where: { totalTrades: { gt: 0 } } });
      return NextResponse.json({ success: true, task: 'stats', traderCount: count, scored });
    }

    return NextResponse.json({ error: 'Unknown task. Valid: refresh-leaderboard, populate, stats' }, { status: 400 });
  } catch (error) {
    logger.error({ task, error }, 'Admin cron failed');
    return NextResponse.json({ error: 'Cron failed', details: (error as Error).message }, { status: 500 });
  }
}