import { syncPolymarketTrader } from '@/lib/polymarket/leaderboard';
import { discoverAndImportFast } from '@/lib/polymarket/discovery';
import { refreshPrecomputedRankings } from '@/lib/intelligence/rankings';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

let isRunning = false;
let intervalId: ReturnType<typeof setInterval> | null = null;
let lastDiscoveryAt: number = 0;

/**
 * Continuous Sync Engine
 *
 * Runs inside the Next.js server process.
 * - Discovers new traders every 5 minutes
 * - Syncs stale trader scores every 60 seconds
 * - Precomputes rankings every 2 minutes
 *
 * Call startEngine() once on server startup.
 */
export function startEngine() {
  if (isRunning) {
    logger.info('Sync engine already running');
    return;
  }

  isRunning = true;
  logger.info('Starting continuous Polymarket sync engine...');

  // Main sync loop — every 60 seconds
  intervalId = setInterval(async () => {
    try {
      const now = Date.now();
      const discoveryInterval = 5 * 60 * 1000; // 5 minutes

      // Phase 1: Discover new traders (every 15 min — reduced frequency)
      if (now - lastDiscoveryAt > discoveryInterval) {
        logger.info('Engine: Discovering new traders...');
        try {
          const discovery = await discoverAndImportFast(50); // reduced from 300
          logger.info(discovery, 'Engine: Discovery complete');
        } catch (e) {
          logger.warn({ e }, 'Engine: Discovery failed');
        }
        lastDiscoveryAt = now;
      }

      // Phase 2: Sync stale traders (every 60 sec, batch of 3 — reduced to avoid rate limits)
      const staleThreshold = Date.now() - 30 * 60 * 1000; // 30 min
      const stale = await prisma.polymarketTrader.findMany({
        where: {
          OR: [
            { lastSyncedAt: { lt: new Date(staleThreshold) } },
            { totalTrades: 0 },
          ],
        },
        take: 5,
        orderBy: { lastSyncedAt: 'asc' },
      });

      if (stale.length > 0) {
        let synced = 0;
        for (let i = 0; i < stale.length; i += 1) {
          const batch = stale.slice(i, i + 1);
          const results = await Promise.allSettled(
            batch.map((t) => syncPolymarketTrader(t.proxyWallet, t.categories))
          );
          for (const r of results) {
            if (r.status === 'fulfilled' && r.value) synced++;
          }
          // 2 second delay between each sync to avoid rate limiting
          if (i < stale.length - 1) await new Promise(r => setTimeout(r, 2000));
        }
        logger.info({ attempted: stale.length, synced }, 'Engine: Trader sync batch complete');
      }

      // Phase 3: Precompute rankings (every 2 min)
      if (Math.floor(now / 120000) % 1 === 0) {
        await refreshPrecomputedRankings();
      }
    } catch (error) {
      logger.error({ error }, 'Engine: Sync loop error');
    }
  }, 60 * 1000); // Every 60 seconds

  logger.info('Sync engine started — running every 60s');
}

export function stopEngine() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  isRunning = false;
  logger.info('Sync engine stopped');
}

export function isEngineRunning() {
  return isRunning;
}
