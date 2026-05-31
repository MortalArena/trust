import { NextRequest, NextResponse } from 'next/server';
import { runFullDiscoveryAndSync } from '@/lib/polymarket/full-discovery';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 600; // 10 minutes max

/**
 * GET /api/discover-all
 * Full discovery pipeline:
 * 1. Scan ALL trades from Polymarket Data API to discover every unique wallet
 * 2. For each wallet, fetch complete trade history
 * 3. Calculate V2 reputation scores
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  const secret = req.nextUrl.searchParams.get('secret');
  
  // Require auth
  if (secret !== process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await runFullDiscoveryAndSync();
    return NextResponse.json({ success: true, ...summary });
  } catch (error: any) {
    console.error('Discovery error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/discover-all/status
 * Get current discovery/sync status
 */
export async function POST(req: Request) {
  try {
    const [traders, trades, v2Scored, lastSync] = await Promise.all([
      prisma.polymarketTrader.count(),
      prisma.polymarketTrade.count(),
      prisma.polymarketTrader.count({ where: { masterPMI: { gt: 0 } } }),
      prisma.polymarketTrader.findFirst({
        orderBy: { lastSyncedAt: 'desc' },
        select: { lastSyncedAt: true, proxyWallet: true },
      }),
    ]);

    return NextResponse.json({
      traders,
      trades,
      v2Scored,
      lastSync: lastSync?.lastSyncedAt?.toISOString() ?? null,
      lastWallet: lastSync?.proxyWallet?.slice(0, 12) ?? null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
