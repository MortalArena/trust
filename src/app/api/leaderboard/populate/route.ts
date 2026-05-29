import { NextRequest, NextResponse } from 'next/server';
import { discoverAndImportFast } from '@/lib/polymarket/discovery';
import { syncPolymarketTrader } from '@/lib/polymarket/leaderboard';
import { refreshPrecomputedRankings } from '@/lib/intelligence/rankings';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function isAuthorized(req: NextRequest): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  const authHeader = req.headers.get('authorization');
  const apiKeyValue = req.headers.get('x-api-key');
  const referer = req.headers.get('referer') ?? '';
  return (
    authHeader === `Bearer ${process.env.CRON_SECRET}` || 
    apiKeyValue === process.env.CRON_SECRET ||
    (process.env.NODE_ENV !== 'production' && referer.includes('localhost'))
  );
}

/**
 * POST /api/leaderboard/populate?sync=50
 * Discover wallets from Polymarket (recent trades + events), import, sync scores, refresh boards.
 * Open in development; CRON_SECRET required in production.
 */
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const syncParam = req.nextUrl.searchParams.get('sync');
  const deepScan = req.nextUrl.searchParams.get('deepScan') === '1';
  const syncLimit = Math.min(Number(syncParam) || 20, 200);
  const start = Date.now();

  try {
    // مرحباً بـ deep scan لو مطلوب (يجيب كل الفئات)
    const walletCounts: Record<string, number> = {};
    
    if (!deepScan) {
      const discovery = await discoverAndImportFast(2500);
      walletCounts.found = discovery.imported ?? 0;
    }

    const toSync = await prisma.polymarketTrader.findMany({
      where: {
        OR: [{ totalTrades: 0 }, { edgeScore: 0 }],
      },
      orderBy: { createdAt: 'desc' },
      take: syncLimit,
      select: { proxyWallet: true, categories: true },
    });

    walletCounts.toSync = toSync.length;

    let synced = 0;
    let failed = 0;

    for (let i = 0; i < toSync.length; i += 4) {
      const batch = toSync.slice(i, i + 4);
      const results = await Promise.allSettled(
        batch.map((t) =>
          syncPolymarketTrader(t.proxyWallet, t.categories.length > 0 ? t.categories : ['politics'])
        )
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) synced++;
        else failed++;
      }
    }

    const rankings = await refreshPrecomputedRankings().catch((e) => {
      logger.warn({ e }, 'Rankings refresh skipped');
      return {};
    });

    const totalInDB = await prisma.polymarketTrader.count();
    const scored = await prisma.polymarketTrader.count({ where: { totalTrades: { gt: 0 } } });

    return NextResponse.json({
      success: true,
      walletCounts,
      sync: { attempted: toSync.length, synced, failed },
      rankings,
      totalInDB,
      scored,
      elapsedSec: ((Date.now() - start) / 1000).toFixed(1),
    });
  } catch (error) {
    logger.error({ error }, 'Populate failed');
    return NextResponse.json(
      { error: 'Populate failed', details: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: 'POST /api/leaderboard/populate?sync=50',
    description:
      'Discover Polymarket traders from live trades, import to DB, sync trust/edge scores, refresh ranking boards.',
    auth: process.env.NODE_ENV === 'production' ? 'CRON_SECRET (Bearer or x-api-key)' : 'open in dev',
  });
}
