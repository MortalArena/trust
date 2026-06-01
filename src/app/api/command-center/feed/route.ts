import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(50, parseInt(url.searchParams.get('limit') || '30'));

    // Get recent high-activity traders
    const topTraders = await prisma.polymarketTrader.findMany({
      where: { totalTrades: { gte: 5 } },
      orderBy: { masterPMI: 'desc' },
      take: limit,
      select: {
        proxyWallet: true,
        displayName: true,
        totalTrades: true,
        masterPMI: true,
        edgeScore: true,
        roi: true,
        winRate: true,
        totalVolumeUsd: true,
        categories: true,
        lastSyncedAt: true,
      },
    });

    // Get recent predictions
    const recentPredictions = await prisma.prediction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        title: true,
        predictedOutcome: true,
        outcome: true,
        createdAt: true,
        authorId: true,
      },
    });

    // Build feed items
    const items: any[] = [];

    // Add trader activity
    for (const t of topTraders.slice(0, 15)) {
      items.push({
        id: `trader-${t.proxyWallet.slice(0, 8)}`,
        type: Number(t.totalVolumeUsd) > 50000 ? 'whale' : 'trade',
        trader: t.displayName || `${t.proxyWallet.slice(0, 6)}...${t.proxyWallet.slice(-4)}`,
        traderWallet: t.proxyWallet,
        action: `Active in ${t.categories?.[0] || 'general'} · ${t.totalTrades} trades`,
        size: Number(t.totalVolumeUsd),
        pmiScore: Number(t.masterPMI) || 0,
        alphaScore: Number(t.edgeScore) || 0,
        change: Number(t.roi) || 0,
        timestamp: t.lastSyncedAt?.getTime() || Date.now(),
        category: t.categories?.[0] || 'general',
      });
    }

    // Add predictions
    for (const p of recentPredictions) {
      items.push({
        id: `pred-${p.id}`,
        type: 'prediction',
        action: `New prediction: ${p.title?.slice(0, 60) || 'Unknown'}`,
        change: p.outcome === 'WIN' ? 10 : p.outcome === 'LOSS' ? -5 : 0,
        timestamp: p.createdAt?.getTime() || Date.now(),
      });
    }

    // Sort by timestamp desc
    items.sort((a, b) => b.timestamp - a.timestamp);

    return NextResponse.json({ items: items.slice(0, limit) });
  } catch (error) {
    console.error('Command Center feed error:', error);
    return NextResponse.json({ items: [] });
  }
}
