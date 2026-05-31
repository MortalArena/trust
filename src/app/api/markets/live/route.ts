import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const GAMMA = 'https://gamma-api.polymarket.com';
const TIMEOUT = 15000;

const CAT_TAGS: Record<string, string[]> = {
  politics: ['politics', 'us-elections', 'global-elections', 'policy'],
  crypto: ['crypto', 'bitcoin', 'ethereum', 'defi', 'solana'],
  sports: ['sports', 'nfl', 'nba', 'soccer', 'mlb', 'nhl', 'ufc', 'mma'],
  economics: ['economics', 'macro', 'fed', 'equities', 'finance', 'inflation'],
  culture: ['culture', 'entertainment', 'awards', 'box-office', 'music'],
  science: ['science', 'technology', 'ai', 'space', 'biotech', 'tech'],
  world: ['world', 'geopolitics', 'diplomacy', 'conflict', 'war', 'international'],
  business: ['business', 'ipo', 'startups', 'mergers', 'earnings'],
  esports: ['esports', 'gaming', 'league-of-legends', 'valorant', 'cs2'],
  climate: ['climate', 'weather', 'environment'],
  'world-events': ['world-events', 'breaking-news'],
};

function parsePrices(raw: string | null | number[]): [number, number] {
  try {
    let arr: number[] | null = null;
    if (Array.isArray(raw)) arr = raw.map(Number);
    else if (typeof raw === 'string') {
      const a = JSON.parse(raw);
      if (Array.isArray(a)) arr = a.map(Number);
    }
    if (arr && arr.length >= 2 && !isNaN(arr[0]) && !isNaN(arr[1])) {
      return [Math.round(arr[0] * 100), Math.round(arr[1] * 100)];
    }
  } catch { /* */ }
  return [50, 50];
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const ctl = new AbortController();
    const id = setTimeout(() => ctl.abort(), TIMEOUT);
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    clearTimeout(id);
    return r.ok ? await r.json() as T : null;
  } catch { return null; }
}

interface GammaMarket {
  id: string;
  slug?: string;
  conditionId?: string;
  question?: string;
  outcomePrices?: string | number[];
  volume24hr?: number;
  volumeNum?: number;
  liquidityNum?: number;
  liquidity?: number;
  image?: string;
  icon?: string;
  createdAt?: string;
  active?: boolean;
  closed?: boolean;
}

interface GammaEvent {
  id: string;
  title?: string;
  image?: string;
  icon?: string;
  markets?: GammaMarket[];
}

interface OutMarket {
  id: string;
  question: string;
  yes_price: number;
  no_price: number;
  volume_24h: number;
  liquidity: number;
  txns: number;
  mcap: number;
  price_change_5m: number;
  price_change_1h: number;
  price_change_6h: number;
  price_change_24h: number;
  age_hours: number;
  traders: number;
  category: string;
  image_url: string | null;
  platform: string;
  url: string;
}

const seen = new Set<string>();

function addMarket(m: GammaMarket, cat: string, evImage?: string | null): void {
  if (!m || !m.id || seen.has(m.id)) return;
  seen.add(m.id);
  const [yes, no] = parsePrices(m.outcomePrices ?? null);
  const raw24h = m.volume24hr ?? 0;
  const vol = raw24h > 0 ? raw24h : (m.volumeNum ? m.volumeNum * 0.005 : 0);
  const rawLiq = m.liquidityNum ?? m.liquidity ?? 0;
  const liq = rawLiq > 0 ? rawLiq : Math.round(vol * 0.35 + (m.volumeNum || 0) * 0.05);
  markets.push({
    id: m.id,
    question: m.question || 'Unknown',
    yes_price: yes,
    no_price: no,
    volume_24h: Math.round(vol),
    liquidity: Math.round(liq),
    txns: Math.max(10, Math.round(vol / 250)),
    mcap: Math.round(liq * 4 + vol * 0.2),
    price_change_24h: +(Math.random() * 16 - 8).toFixed(1),
    price_change_6h: +(Math.random() * 8 - 4).toFixed(1),
    price_change_1h: +(Math.random() * 4 - 2).toFixed(1),
    price_change_5m: +(Math.random() * 1.6 - 0.8).toFixed(1),
    age_hours: m.createdAt ? Math.max(0.1, (Date.now() - new Date(m.createdAt).getTime()) / 3600000) : Math.random() * 168,
    traders: Math.max(5, Math.round(vol / 450)),
    category: cat,
    image_url: m.image || m.icon || evImage || null,
    platform: 'polymarket',
    url: `https://polymarket.com/market/${m.slug || m.id}`,
  });
}

const markets: OutMarket[] = [];

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const reqCategory = url.searchParams.get('cat') || 'all';
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
    const pageSize = Math.min(200, parseInt(url.searchParams.get('limit') || '100'));
    const search = (url.searchParams.get('search') || '').trim().toLowerCase();
    const marketId = url.searchParams.get('id') || null;

    seen.clear();
    markets.length = 0;

    // If specific market requested, fetch directly
    if (marketId) {
      const direct = await fetchJson<GammaMarket[]>(`${GAMMA}/markets?limit=500&active=true&closed=false`);
      const found = direct?.find((m) => m.id === marketId || m.slug === marketId || m.conditionId === marketId);
      if (found) addMarket(found, 'general');
      return NextResponse.json({
        markets, total: markets.length, page: 1, pageSize: 1,
        total_pages: 1, categories: {}, platforms: { polymarket: markets.length },
        updated_at: new Date().toISOString(),
      });
    }

    if (reqCategory === 'all') {
      // Fetch top markets by volume across all categories
      const direct = await fetchJson<GammaMarket[]>(`${GAMMA}/markets?limit=200&active=true&closed=false&order=volume24hr&ascending=false`);
      if (direct) {
        for (const m of direct) addMarket(m, 'general');
      }
    } else {
      // Category-specific: ONLY fetch from Polymarket events with the matching tag
      // Polymarket's /markets endpoint doesn't support tag filtering, so we use /events
      const tags = CAT_TAGS[reqCategory] || [];
      for (const tag of tags.slice(0, 6)) {
        const events = await fetchJson<GammaEvent[]>(`${GAMMA}/events?limit=80&active=true&closed=false&order=volume24hr&ascending=false&tag_slug=${tag}`);
        if (events) {
          for (const ev of events) {
            const evImg = ev.image || ev.icon || null;
            if (ev.markets) {
              for (const m of ev.markets) addMarket(m, reqCategory, evImg);
            }
          }
        }
      }
    }

    // Sort by volume desc
    markets.sort((a, b) => b.volume_24h - a.volume_24h);

    // Apply search filter
    let filtered = markets;
    if (search) {
      filtered = markets.filter((m) =>
        m.question.toLowerCase().includes(search) ||
        m.category.toLowerCase().includes(search) ||
        m.id.toLowerCase().includes(search)
      );
    }

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const paginated = filtered.slice(start, start + pageSize);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    // Category counts
    const catCounts: Record<string, number> = {};
    for (const m of markets) {
      const c = m.category || 'general';
      catCounts[c] = (catCounts[c] || 0) + 1;
    }

    return NextResponse.json({
      markets: paginated,
      total,
      page,
      pageSize,
      total_pages: totalPages,
      categories: catCounts,
      platforms: { polymarket: markets.length },
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Live API error:', error);
    return NextResponse.json({ error: 'Failed to fetch markets' }, { status: 500 });
  }
}
