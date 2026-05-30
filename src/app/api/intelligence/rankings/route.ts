import { NextRequest, NextResponse } from 'next/server';
import { RANKING_BOARDS, type RankingBoardId } from '@/lib/intelligence/edge-score';
import { getPrecomputedRanking } from '@/lib/intelligence/rankings';
import { getLeaderboard } from '@/lib/polymarket/leaderboard';

/**
 * GET /api/intelligence/rankings?board=top_edge
 * Returns precomputed ranking board when available; falls back to live DB query.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const board = (searchParams.get('board') ?? 'top_edge') as RankingBoardId;
    const limit = Math.min(Number(searchParams.get('limit')) || 100, 200);

    if (!RANKING_BOARDS.includes(board)) {
      return NextResponse.json(
        { error: `Invalid board. Valid: ${RANKING_BOARDS.join(', ')}` },
        { status: 400 }
      );
    }

    const cached = await getPrecomputedRanking(board);
    if (cached.entries.length > 0) {
      return NextResponse.json({
        success: true,
        board,
        source: 'precomputed',
        total: Math.min(cached.entries.length, limit),
        traders: cached.entries.slice(0, limit),
        updatedAt: cached.computedAt,
      });
    }

    const sortMap: Record<
      RankingBoardId,
      'edgeScore' | 'roi' | 'winRate' | 'consistency' | 'totalVolumeUsd' | 'trustScore' | 'profitFactor' | 'maxDrawdown'
    > = {
      top_edge: 'edgeScore',
      highest_roi_30d: 'roi',
      best_win_rate: 'winRate',
      most_consistent: 'consistency',
      smart_money_volume: 'totalVolumeUsd',
      top_trust: 'trustScore',
      best_profit_factor: 'profitFactor',
      lowest_risk: 'maxDrawdown',
    };

    const minTrades = board === 'best_win_rate' ? 20 : board === 'best_profit_factor' || board === 'lowest_risk' ? 10 : 5;
    const traders = await getLeaderboard({
      limit,
      sortBy: sortMap[board],
      minTrades,
    });

    return NextResponse.json({
      success: true,
      board,
      source: 'live',
      total: traders.entries.length,
      traders: traders.entries,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Intelligence rankings API error:', error);
    return NextResponse.json({ error: 'Failed to fetch rankings' }, { status: 500 });
  }
}
