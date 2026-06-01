import { NextRequest, NextResponse } from 'next/server';
import { fetchAllActiveMarkets } from '@/lib/polymarket/full-fetcher';

export const dynamic = 'force-dynamic';

// In-memory cache (30s TTL)
let cache: { data: any[]; timestamp: number } | null = null;
const CACHE_TTL = 30_000;

interface OutMarket {
  id: string; question: string; yes_price: number; no_price: number;
  volume_24h: number; liquidity: number; txns: number; mcap: number;
  price_change_5m: number; price_change_1h: number; price_change_6h: number; price_change_24h: number;
  age_hours: number; traders: number; category: string;
  image_url: string|null; platform: string; url: string;
  conditionId?: string;
  slug?: string;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const reqCategory = url.searchParams.get('cat') || 'all';
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
    const pageSize = Math.min(200, parseInt(url.searchParams.get('limit') || '100'));
    const search = (url.searchParams.get('search') || '').trim().toLowerCase();
    const marketId = url.searchParams.get('id') || null;

    let allMarkets: OutMarket[] = [];

    // Check cache for common requests
    if (!search && !marketId && reqCategory === 'all' && page === 1 && cache && (Date.now() - cache.timestamp) < CACHE_TTL) {
      allMarkets = cache.data;
    } else {
      allMarkets = await fetchAllActiveMarkets(
        reqCategory !== 'all' ? reqCategory : undefined,
        50
      );
      if (!search && !marketId && reqCategory === 'all') {
        cache = { data: allMarkets, timestamp: Date.now() };
      }
    }

    // Filter by marketId
    if (marketId) {
      const found = allMarkets.find(m => m.id === marketId || m.slug === marketId);
      if (found) {
        return NextResponse.json({
          markets: [found], total: 1, page: 1, pageSize: 1,
          total_pages: 1, categories: {}, platforms: { polymarket: 1 },
          updated_at: new Date().toISOString(),
        });
      }
    }

    // Apply filters
    let filtered = allMarkets;
    if (search) {
      filtered = allMarkets.filter((m) =>
        m.question.toLowerCase().includes(search) ||
        m.category.toLowerCase().includes(search)
      );
    } else if (reqCategory !== 'all') {
      filtered = allMarkets.filter(m => m.category === reqCategory);
    }

    filtered.sort((a, b) => b.volume_24h - a.volume_24h);

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const paginated = filtered.slice(start, start + pageSize);

    return NextResponse.json({
      markets: paginated,
      total,
      page,
      pageSize,
      total_pages: Math.max(1, Math.ceil(total / pageSize)),
      categories: {},
      platforms: { polymarket: allMarkets.length },
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Live API error:', error);
    return NextResponse.json({ error: 'Failed to fetch markets', markets: [] }, { status: 500 });
  }
}
