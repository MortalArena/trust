import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// In-memory signals cache
let signalsCache: { data: any[]; timestamp: number } | null = null;
const CACHE_TTL = 15_000; // 15 seconds

export async function GET(req: NextRequest) {
  try {
    // Check cache
    if (signalsCache && (Date.now() - signalsCache.timestamp) < CACHE_TTL) {
      return NextResponse.json({ signals: signalsCache.data, cached: true });
    }

    // Get top traders for signal generation
    const traders = await prisma.polymarketTrader.findMany({
      where: { totalTrades: { gt: 0 } },
      orderBy: { masterPMI: 'desc' },
      take: 100,
      select: {
        proxyWallet: true, displayName: true, totalVolumeUsd: true,
        masterPMI: true, alphaScore: true, smartScore: true,
        insiderScore: true, stealthScore: true, whaleTier: true,
        totalTrades: true, winRate: true, roi: true, categories: true,
      },
    });

    // Get active markets
    const markets = await prisma.polymarketTrade.findMany({
      where: { timestamp: { gt: new Date(Date.now() - 24 * 3600 * 1000) } },
      select: {
        marketId: true, valueUsd: true, timestamp: true,
      },
    });

    // Generate signals
    const signals: any[] = [];

    for (const trader of traders) {
      const volume = Number(trader.totalVolumeUsd) || 0;
      const pmi = Number(trader.masterPMI) || 0;
      const alpha = Number(trader.alphaScore) || 0;
      const insider = Number(trader.insiderScore) || 0;
      const stealth = Number(trader.stealthScore) || 0;
      const smart = Number(trader.smartScore) || 0;

      // Whale signal
      if (volume > 100000) {
        signals.push({
          id: `whale-${trader.proxyWallet.slice(0, 8)}`,
          type: 'WHALE_ACTIVITY',
          severity: volume > 1000000 ? 'CRITICAL' : volume > 500000 ? 'HIGH' : 'MEDIUM',
          icon: '🐋',
          title: `Whale: ${trader.displayName || trader.proxyWallet.slice(0, 10) + '...'}`,
          description: `Volume: $${volume.toLocaleString()} · PMI: ${pmi.toFixed(1)}`,
          trader: trader.proxyWallet,
          data: { volume, pmi, alpha },
          timestamp: Date.now(),
        });
      }

      // Smart money signal
      if (pmi > 80 && Number(trader.totalTrades) > 20) {
        signals.push({
          id: `smart-${trader.proxyWallet.slice(0, 8)}`,
          type: 'SMART_MONEY',
          severity: pmi > 90 ? 'CRITICAL' : 'HIGH',
          icon: '🧠',
          title: `Smart Money: ${trader.displayName || trader.proxyWallet.slice(0, 10) + '...'}`,
          description: `PMI: ${pmi.toFixed(1)} · Alpha: ${alpha.toFixed(1)} · Smart: ${smart.toFixed(1)}`,
          trader: trader.proxyWallet,
          data: { pmi, alpha, smart },
          timestamp: Date.now(),
        });
      }

      // Insider signal
      if (insider > 60) {
        signals.push({
          id: `insider-${trader.proxyWallet.slice(0, 8)}`,
          type: 'INSIDER',
          severity: insider > 80 ? 'CRITICAL' : 'HIGH',
          icon: '🕵️',
          title: `Insider: ${trader.displayName || trader.proxyWallet.slice(0, 10) + '...'}`,
          description: `Insider Score: ${insider.toFixed(0)} · Win Rate: ${Number(trader.winRate || 0).toFixed(0)}%`,
          trader: trader.proxyWallet,
          data: { insider, winRate: trader.winRate },
          timestamp: Date.now(),
        });
      }

      // Stealth signal
      if (stealth > 70) {
        signals.push({
          id: `stealth-${trader.proxyWallet.slice(0, 8)}`,
          type: 'STEALTH',
          severity: stealth > 85 ? 'CRITICAL' : 'HIGH',
          icon: '👻',
          title: `Stealth Trader: ${trader.displayName || trader.proxyWallet.slice(0, 10) + '...'}`,
          description: `Stealth Score: ${stealth.toFixed(0)} · Volume: $${volume.toLocaleString()}`,
          trader: trader.proxyWallet,
          data: { stealth, volume },
          timestamp: Date.now(),
        });
      }
    }

    // Sort by severity
    const sevOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    signals.sort((a, b) => (sevOrder[a.severity as keyof typeof sevOrder] || 3) - (sevOrder[b.severity as keyof typeof sevOrder] || 3));

    // Cache
    signalsCache = { data: signals, timestamp: Date.now() };

    return NextResponse.json({ signals, total: signals.length, cached: false });
  } catch (error) {
    console.error('Signals API error:', error);
    return NextResponse.json({ signals: [], error: 'Failed to generate signals' }, { status: 500 });
  }
}
