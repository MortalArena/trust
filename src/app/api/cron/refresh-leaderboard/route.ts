import { NextRequest, NextResponse } from 'next/server';
import { syncPolymarketTrader } from '@/lib/polymarket/leaderboard';
import { discoverAndImportFast } from '@/lib/polymarket/discovery';
import { refreshPrecomputedRankings } from '@/lib/intelligence/rankings';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET /api/cron/refresh-leaderboard
 *
 * Continuous three-phase refresh pipeline:
 * 1. Discover new Polymarket traders from active events
 * 2. Sync trust scores for all unsynced / stale traders (synced > 1hr ago)
 * 3. Precompute ranking boards
 *
 * Designed to run every 60 seconds via cron.
 * Each run processes a small batch to stay within time limits.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const phases: Record<string, unknown> = {};

  try {
    // ── Phase 1: Discover new traders (small batch each run) ──
    // Each run discovers up to 500 new wallets — over time this covers all of Polymarket
    logger.info('Phase 1: Discovering new traders');
    const discovery = await discoverAndImportFast(500);
    phases.discovery = discovery;

    // ── Phase 2: Sync unsynced / stale traders ──
    // Process traders that were never synced (totalTrades = 0) or stale (> 1 hour)
    const syncBatchSize = 150; // Process 150 traders per cycle
    const staleThreshold = Date.now() - 60 * 60 * 1000; // 1 hour

    logger.info('Phase 2: Syncing unsynced/stale traders');
    const unsynced = await prisma.polymarketTrader.findMany({
      where: {
        OR: [
          { lastSyncedAt: { lt: new Date(staleThreshold) } },
          { totalTrades: 0 },
        ],
      },
      take: syncBatchSize,
      orderBy: { lastSyncedAt: 'asc' }, // Oldest first
    });

    phases.unsyncedCount = unsynced.length;

    let syncedCount = 0;
    let failedCount = 0;

    // Process in batches of 5 concurrent to avoid rate limits
    for (let i = 0; i < unsynced.length; i += 5) {
      const batch = unsynced.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map(async (trader) => {
          const category = trader.categories[0] ?? 'general';
          const brief = await syncPolymarketTrader(trader.proxyWallet, [category]);
          return { wallet: trader.proxyWallet, synced: Boolean(brief) };
        })
      );

      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.synced) syncedCount++;
        else failedCount++;
      }
    }

    phases.sync = {
      attempted: unsynced.length,
      synced: syncedCount,
      failed: failedCount,
    };

    // ── Phase 3: Precompute ranking boards ──
    logger.info('Phase 3: Precomputing intelligence rankings');
    phases.rankings = await refreshPrecomputedRankings();

    const duration = Date.now() - startTime;
    logger.info({ durationMs: duration, phases }, 'Leaderboard refresh completed');

    return NextResponse.json({
      success: true,
      durationMs: duration,
      phases,
      nextRun: 'Call again in 60 seconds for continuous sync',
    });
  } catch (error) {
    logger.error({ error }, 'Leaderboard refresh failed');
    return NextResponse.json(
      { error: 'Refresh failed', message: (error as Error).message },
      { status: 500 }
    );
  }
}
