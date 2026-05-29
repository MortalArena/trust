import { NextRequest, NextResponse } from 'next/server';
import { getLeaderboard } from '@/lib/polymarket/leaderboard';
import { MARKET_CATEGORIES } from '@/lib/markets/categories';

/**
 * GET /api/leaderboard/traders
 * Returns Polymarket leaderboard with full-text search, multi-category filter,
 * and pagination.
 *
 * Query params:
 *   category   - Single category filter (e.g. "sports") - legacy
 *   categories - Comma-separated multi-category filter (e.g. "sports,crypto")
 *   search     - Full-text search on name / pseudonym / wallet
 *   minTrades  - Minimum trades required (default: 0)
 *   limit      - Max results per page (default: 50, max: 200)
 *   page       - Page number (default: 1)
 *   sortBy     - Sort field: edgeScore | trustScore | roi | winRate | consistency | totalVolumeUsd | totalTrades
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const categorySlug = searchParams.get('category') ?? undefined;
    const categoriesParam = searchParams.get('categories') ?? undefined;
    const search = searchParams.get('search') ?? undefined;
    const minTrades = Number(searchParams.get('minTrades')) || 0;
    const limit = Math.min(Number(searchParams.get('limit')) || 50, 200);
    const page = Math.max(Number(searchParams.get('page')) || 1, 1);

    const sortBy = (searchParams.get('sortBy') ?? 'edgeScore') as
      | 'edgeScore'
      | 'trustScore'
      | 'roi'
      | 'winRate'
      | 'consistency'
      | 'totalVolumeUsd'
      | 'totalTrades';

    // Parse multi-categories from comma-separated string
    const categories = categoriesParam
      ? categoriesParam.split(',').map((c) => c.trim()).filter(Boolean)
      : undefined;

    // Validate categories if provided
    const validSlugs = new Set(MARKET_CATEGORIES.map((c) => c.slug));
    if (categorySlug && !validSlugs.has(categorySlug)) {
      return NextResponse.json(
        { error: `Invalid category "${categorySlug}". Valid: ${Array.from(validSlugs).join(', ')}` },
        { status: 400 }
      );
    }
    if (categories) {
      for (const cat of categories) {
        if (!validSlugs.has(cat)) {
          return NextResponse.json(
            { error: `Invalid category "${cat}". Valid: ${Array.from(validSlugs).join(', ')}` },
            { status: 400 }
          );
        }
      }
    }

    const result = await getLeaderboard({
      categorySlug,
      categories,
      search,
      minTrades,
      limit,
      page,
      sortBy,
    });

    return NextResponse.json({
      success: true,
      category: categorySlug ?? categories?.join(',') ?? 'all',
      search: search ?? null,
      ...result,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Leaderboard API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch leaderboard' },
      { status: 500 }
    );
  }
}