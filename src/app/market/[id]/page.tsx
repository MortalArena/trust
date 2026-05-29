'use client';

import { use, useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';

interface MD {
  id: string;
  question: string;
  yes_price: number;
  no_price: number;
  condition_id?: string;
  volume_24h: number;
  liquidity: number;
  mcap: number;
  txns: number;
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
  end_date?: string;
}

interface Trade {
  id: string;
  wallet: string;
  side: string;
  outcome: string;
  price: number;
  size: number;
  total_value: number;
  timestamp: number;
  time_ago: string;
}

interface CP {
  time: number;
  yes: number;
  no: number;
  volume: number; // Volume in that point
}

interface OrderBookLevel {
  price: number;
  size: number;
  total: number;
}

interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

const PL: Record<string, { icon: string; gradient: string; name: string }> = {
  polymarket: { icon: 'P', gradient: 'from-blue-600 to-purple-600', name: 'Polymarket' },
  kalshi: { icon: 'K', gradient: 'from-emerald-600 to-teal-600', name: 'Kalshi' },
  manifold: { icon: 'M', gradient: 'from-amber-500 to-orange-600', name: 'Manifold' },
};

const fmtN = (n: number) => {
  if (!n || n <= 0) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
};

const clsC = (n: number) => (n > 0 ? '#10b981' : n < 0 ? '#ef4444' : '#64748b');

const fmtAge = (h: number): string => {
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
};

const init2 = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .substring(0, 2) || 'PM';

// Canvas Chart incorporating vertical volume bars at the bottom
function ProbChart({ data, yP, nP }: { data: CP[]; yP: number; nP: number }) {
  const cRef = useRef<HTMLCanvasElement>(null);
  const rRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cv = cRef.current;
    const ct = rRef.current;
    if (!cv || !ct || data.length < 2) return;

    const d = window.devicePixelRatio || 1;
    const rc = ct.getBoundingClientRect();
    cv.width = rc.width * d;
    cv.height = rc.height * d;
    cv.style.width = rc.width + 'px';
    cv.style.height = rc.height + 'px';

    const c = cv.getContext('2d');
    if (!c) return;
    c.scale(d, d);

    const w = rc.width;
    const h = rc.height;
    const p = { t: 25, r: 60, b: 40, l: 8 };
    const cw = w - p.l - p.r;
    const ch = h - p.t - p.b;

    const mn = data[0].time;
    const mx = data[data.length - 1].time;
    const rg = mx - mn || 1;

    const tx = (t: number) => p.l + ((t - mn) / rg) * cw;
    const ty = (v: number) => p.t + (1 - v / 100) * ch;

    // Draw horizontal probability grids
    c.strokeStyle = 'rgba(255,255,255,0.03)';
    c.lineWidth = 1;
    for (let i = 0; i <= 100; i += 25) {
      const y = ty(i);
      c.beginPath();
      c.moveTo(p.l, y);
      c.lineTo(p.l + cw, y);
      c.stroke();

      c.fillStyle = '#475569';
      c.font = '9px monospace';
      c.textAlign = 'left';
      c.fillText(i + '%', p.l + cw + 6, y + 3);
    }

    // DRAW VERTICAL VOLUME BARS at the bottom (20% height of chart area)
    const maxVolume = Math.max(...data.map((d) => d.volume), 1);
    const volH = ch * 0.22; // max height of volume bars
    data.forEach((pt, i) => {
      const x = tx(pt.time);
      const barH = (pt.volume / maxVolume) * volH;
      const barW = Math.max(1.5, cw / data.length - 3);

      c.fillStyle = 'rgba(59, 130, 246, 0.08)'; // Deep blue transparent bar
      c.fillRect(x - barW / 2, p.t + ch - barH, barW, barH);
    });

    // Draw YES fill gradient
    c.beginPath();
    c.moveTo(tx(data[0].time), ty(data[0].yes));
    for (let i = 1; i < data.length; i++) c.lineTo(tx(data[i].time), ty(data[i].yes));
    c.lineTo(tx(data[data.length - 1].time), p.t + ch);
    c.lineTo(tx(data[0].time), p.t + ch);
    c.closePath();
    const g = c.createLinearGradient(0, p.t, 0, p.t + ch);
    g.addColorStop(0, 'rgba(16, 185, 129, 0.18)');
    g.addColorStop(1, 'rgba(16, 185, 129, 0.01)');
    c.fillStyle = g;
    c.fill();

    // Draw YES line
    c.beginPath();
    c.moveTo(tx(data[0].time), ty(data[0].yes));
    for (let i = 1; i < data.length; i++) c.lineTo(tx(data[i].time), ty(data[i].yes));
    c.strokeStyle = '#10b981';
    c.lineWidth = 2.5;
    c.shadowColor = 'rgba(16, 185, 129, 0.25)';
    c.shadowBlur = 8;
    c.stroke();
    c.shadowBlur = 0; // reset shadow

    // Draw NO fill gradient
    c.beginPath();
    c.moveTo(tx(data[0].time), ty(data[0].no));
    for (let i = 1; i < data.length; i++) c.lineTo(tx(data[i].time), ty(data[i].no));
    c.lineTo(tx(data[data.length - 1].time), p.t + ch);
    c.lineTo(tx(data[0].time), p.t + ch);
    c.closePath();
    const g2 = c.createLinearGradient(0, p.t, 0, p.t + ch);
    g2.addColorStop(0, 'rgba(239, 68, 68, 0.14)');
    g2.addColorStop(1, 'rgba(239, 68, 68, 0.01)');
    c.fillStyle = g2;
    c.fill();

    // Draw NO line
    c.beginPath();
    c.moveTo(tx(data[0].time), ty(data[0].no));
    for (let i = 1; i < data.length; i++) c.lineTo(tx(data[i].time), ty(data[i].no));
    c.strokeStyle = '#ef4444';
    c.lineWidth = 2;
    c.stroke();

    // Draw ticker pointers
    c.fillStyle = '#10b981';
    c.font = 'bold 10px monospace';
    c.fillText('YES ' + yP + '%', p.l + cw + 6, ty(yP) - 5);

    c.fillStyle = '#ef4444';
    c.fillText('NO ' + nP + '%', p.l + cw + 6, ty(nP) + 12);
  }, [data, yP, nP]);

  return (
    <div ref={rRef} className="relative h-full w-full bg-zinc-950/40">
      <canvas ref={cRef} className="h-full w-full" />
    </div>
  );
}

// Left column widgets
function ResolutionRulesWidget({ category }: { category: string }) {
  return (
    <div className="rounded border border-zinc-900 bg-zinc-950 p-3 font-mono text-[10px]">
      <div className="mb-2 text-[10px] font-black uppercase tracking-tight text-white flex items-center gap-1">
        <span>📜 RESOLUTION RULEBOOK</span>
        <span className="rounded bg-zinc-900 border border-zinc-800 px-1 py-0.5 text-[8px] text-zinc-500 font-bold">VERIFIED</span>
      </div>
      <p className="text-zinc-400 leading-relaxed mb-2.5">
        This prediction market resolves strictly based on official primary sources. Ambiguities are governed by the oracle commission guidelines.
      </p>
      <div className="space-y-1.5 border-t border-zinc-900 pt-2.5">
        <div className="flex justify-between text-zinc-500"><span className="uppercase">Oracle</span><span className="text-white font-bold">Undeclared Council</span></div>
        <div className="flex justify-between text-zinc-500"><span className="uppercase">Condition</span><span className="text-blue-400 font-bold truncate max-w-[150px]">polymarket/c-{category}</span></div>
        <div className="flex justify-between text-zinc-500"><span className="uppercase">Resolves</span><span className="text-amber-500 font-bold">Settlement Date + 1h</span></div>
      </div>
    </div>
  );
}

function NewsSentimentTicker({ category }: { category: string }) {
  const [news, setNews] = useState<{ text: string; sentiment: 'bullish' | 'bearish' | 'neutral'; impact: number }[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    // Generate category-specific mock news stream
    const items =
      category.toLowerCase() === 'politics'
        ? [
            { text: 'Reuters: Early voting trends indicate high turnout in battlegrounds.', sentiment: 'neutral', impact: 0 },
            { text: 'AP: New debates scheduled next week; probabilities tightening.', sentiment: 'bullish', impact: 1.4 },
            { text: 'WSJ: Campaign raises record funding, intensifying media campaigns.', sentiment: 'bullish', impact: 2.1 },
            { text: 'CNN: Late poll adjustments show minor shifts within confidence margins.', sentiment: 'bearish', impact: -0.8 },
          ]
        : category.toLowerCase() === 'crypto'
        ? [
            { text: 'Bloomberg: Regulator signals potential review of ETF staking features.', sentiment: 'bullish', impact: 3.5 },
            { text: 'Onchain Flow: Giant whale locks $2.4M YES contracts.', sentiment: 'bullish', impact: 4.8 },
            { text: 'Coindesk: Major network upgrade completes smoothly with zero interruptions.', sentiment: 'neutral', impact: 0 },
            { text: 'Reuters: Global macro reports suggest cautious positioning across volatile assets.', sentiment: 'bearish', impact: -1.5 },
          ]
        : [
            { text: 'AP: Sentiment indexes hit high marks heading into key quarters.', sentiment: 'bullish', impact: 1.2 },
            { text: 'WSJ: Market liquidity depth grows as major trading firms increase activity.', sentiment: 'neutral', impact: 0 },
            { text: 'Reuters: Forecast updates trigger massive trading activity among top accounts.', sentiment: 'bearish', impact: -1.9 },
          ];

    setNews(items as any);
  }, [category]);

  useEffect(() => {
    if (news.length === 0) return;
    const interval = setInterval(() => {
      setIndex((i) => (i + 1) % news.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [news.length]);

  if (news.length === 0) return null;

  const current = news[index];
  const color = current.sentiment === 'bullish' ? 'text-emerald-500' : current.sentiment === 'bearish' ? 'text-red-500' : 'text-slate-400';

  return (
    <div className="rounded border border-zinc-900 bg-zinc-950 p-3 font-mono text-[10px]">
      <div className="mb-2 text-[10px] font-black uppercase tracking-tight text-white flex items-center justify-between">
        <span>⚡ SENTIMENT RADAR</span>
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
      </div>
      <div className="h-11 overflow-hidden transition-all duration-300">
        <p className="text-slate-200 leading-snug font-bold">{current.text}</p>
      </div>
      <div className="mt-2.5 flex items-center justify-between border-t border-zinc-900 pt-2 font-bold uppercase text-[9px]">
        <span className="text-zinc-500">SENTIMENT:</span>
        <span className={`${color} rounded bg-zinc-900 border border-zinc-800 px-1 py-px shadow-sm`}>
          {current.sentiment} {current.impact !== 0 ? `(${current.impact > 0 ? '+' : ''}${current.impact}%)` : ''}
        </span>
      </div>
    </div>
  );
}

export default function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [market, setMarket] = useState<MD | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [chart, setChart] = useState<CP[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'whales'>('all');
  const [auto, setAuto] = useState(true);
  const [flash, setFlash] = useState<Set<string>>(new Set());

  // Execution Widget State
  const [contractSide, setContractSide] = useState<'YES' | 'NO'>('YES');
  const [investment, setInvestment] = useState<string>('100');
  const [orderBook, setOrderBook] = useState<OrderBook>({ bids: [], asks: [] });
  const [flashOrderBook, setFlashOrderBook] = useState<boolean>(false);

  const prevIdRef = useRef<string>('');
  const prevCntRef = useRef(0);

  // Reset state when ID shifts
  useEffect(() => {
    if (prevIdRef.current !== id) {
      setMarket(null);
      setTrades([]);
      setChart([]);
      setLoading(true);
      prevIdRef.current = id;
    }
  }, [id]);

  const fetchM = useCallback(async () => {
    try {
      const r = await fetch(`/api/markets/live?id=${id}`);
      const j = await r.json();
      const ms = j.markets || [];
      if (ms.length > 0) {
        setMarket(ms[0]);
      }
    } catch {
      /* */
    }
  }, [id]);

  const fetchT = useCallback(async () => {
    try {
      const r = await fetch(`/api/markets/trades?marketId=${encodeURIComponent(id)}`);
      const j = await r.json();
      const nt = j.trades || [];
      if (nt.length > prevCntRef.current && prevCntRef.current > 0) {
        const s = new Set<string>();
        for (let i = 0; i < Math.min(3, nt.length); i++) s.add(nt[i].id);
        setFlash(s);
        setTimeout(() => setFlash(new Set()), 350);
      }
      prevCntRef.current = nt.length;
      setTrades(nt);
    } catch {
      /* */
    }
  }, [id]);

  // Fetch on mount & ID transitions
  useEffect(() => {
    if (!id) return;
    fetchM();
    fetchT().then(() => setLoading(false));
  }, [id, fetchM, fetchT]);

  // Simulated high-frequency price stream updates
  useEffect(() => {
    if (!auto || !market) return;
    const i = setInterval(() => {
      // Trigger price fluctuations
      const isUp = Math.random() > 0.45;
      const delta = isUp ? 1 : -1;
      setMarket((prev) => {
        if (!prev) return null;
        const newYes = Math.max(5, Math.min(95, prev.yes_price + delta));
        const newNo = 100 - newYes;
        const priceChangeDelta = isUp ? 0.2 : -0.2;

        return {
          ...prev,
          yes_price: newYes,
          no_price: newNo,
          price_change_1h: +(prev.price_change_1h + priceChangeDelta).toFixed(2),
        };
      });

      // Inject a simulated trade into transactions
      const randVal = Math.floor(Math.random() * 2500) + 10;
      const sharesVal = Math.round(randVal / ((isUp ? market.yes_price : market.no_price) / 100));
      const simulatedTrade: Trade = {
        id: `sim-t-${Math.random().toString(36).substr(2, 9)}`,
        wallet: `0x${Math.random().toString(16).substr(2, 8)}...${Math.random().toString(16).substr(2, 4)}`,
        side: Math.random() > 0.5 ? 'BUY' : 'SELL',
        outcome: isUp ? 'YES' : 'NO',
        price: (isUp ? market.yes_price : market.no_price) / 100,
        size: sharesVal,
        total_value: randVal,
        timestamp: Math.floor(Date.now() / 1000),
        time_ago: 'now',
      };

      setTrades((prev) => [simulatedTrade, ...prev].slice(0, 100));
      setFlash((prev) => {
        const next = new Set(prev);
        next.add(simulatedTrade.id);
        return next;
      });
      setTimeout(() => setFlash(new Set()), 350);

    }, 3800);

    return () => clearInterval(i);
  }, [auto, market]);

  // Construct charts data from trades
  useEffect(() => {
    if (!market || trades.length < 2) return;
    const now = Math.floor(Date.now() / 1000);
    const pts: CP[] = [];
    for (let i = 14; i >= 0; i--) {
      const s = now - i * 3600;
      const st = trades.filter((t) => t.timestamp >= s && t.timestamp < s + 3600);
      const yp = st.filter((t) => t.outcome === 'YES').map((t) => t.price);
      const avg = yp.length > 0 ? yp.reduce((a, b) => a + b, 0) / yp.length : market.yes_price / 100;
      const vol = st.reduce((sum, t) => sum + t.total_value, 0) || Math.floor(Math.random() * 5000) + 1500;

      pts.push({
        time: s,
        yes: Math.round(avg * 100),
        no: Math.round((1 - avg) * 100),
        volume: vol,
      });
    }
    setChart(pts);
  }, [market, trades]);

  // Simulate limit Order Book data
  useEffect(() => {
    if (!market) return;
    const targetPrice = contractSide === 'YES' ? market.yes_price : market.no_price;

    const generateOrderBook = () => {
      const bids: OrderBookLevel[] = [];
      const asks: OrderBookLevel[] = [];

      let runningBidTotal = 0;
      let runningAskTotal = 0;

      // Generates 4 levels of depth
      for (let i = 1; i <= 4; i++) {
        const bidPrice = targetPrice - i;
        const askPrice = targetPrice + i;
        if (bidPrice > 0) {
          const bidSize = Math.floor(Math.random() * 15000) + 4000 / i;
          runningBidTotal += bidSize;
          bids.push({ price: bidPrice, size: Math.round(bidSize), total: Math.round(runningBidTotal) });
        }
        if (askPrice < 100) {
          const askSize = Math.floor(Math.random() * 15000) + 4000 / i;
          runningAskTotal += askSize;
          asks.push({ price: askPrice, size: Math.round(askSize), total: Math.round(runningAskTotal) });
        }
      }

      setOrderBook({ bids, asks });
    };

    generateOrderBook();

    const interval = setInterval(() => {
      // Simulate live order book updates and flicker
      setFlashOrderBook(true);
      generateOrderBook();
      setTimeout(() => setFlashOrderBook(false), 250);
    }, 2400);

    return () => clearInterval(interval);
  }, [market, contractSide]);

  if (loading || !market) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#030712]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border border-blue-500 border-t-transparent" />
          <span className="font-mono text-[10px] text-zinc-500 tracking-wider">TARGETING EVENT STREAM...</span>
        </div>
      </div>
    );
  }

  const yP = market.yes_price;
  const nP = market.no_price;
  const liq = market.liquidity || Math.round(market.volume_24h * 0.35);
  const P = PL[market.platform] || { icon: '?', gradient: 'from-zinc-600 to-zinc-700', name: market.platform };
  const ft = filter === 'whales' ? trades.filter((t) => t.total_value >= 1000) : trades;

  // Trading execution terminal math
  const sharePrice = (contractSide === 'YES' ? yP : nP) / 100;
  const investNum = parseFloat(investment) || 0;
  const targetShares = sharePrice > 0 ? investNum / sharePrice : 0;
  const maxPayout = targetShares; // Settle contract price resolves to $1.00
  const maxRoi = sharePrice > 0 ? ((1 / sharePrice) - 1) * 100 : 0;

  // Slippage Estimate based on investment size vs liquidity
  const slippage = Math.min(8.5, Math.max(0.05, (investNum / Math.max(1, liq * 0.08)) * 100));

  return (
    <div className="min-h-screen bg-[#030712] text-slate-100 font-mono">
      {/* Page Header */}
      <header className="sticky top-0 z-50 border-b border-zinc-900 bg-[#030712]/90 backdrop-blur-md px-4 py-2.5">
        <div className="mx-auto flex max-w-[1680px] items-center justify-between">
          <Link href="/" className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-white transition">
            <span className="text-blue-500 font-bold">←</span> BACK TO EXPLORER
          </Link>
          <div className="flex items-center gap-4 text-[10px]">
            <label className="flex items-center gap-1.5 text-zinc-400 select-none cursor-pointer">
              <input
                type="checkbox"
                checked={auto}
                onChange={(e) => setAuto(e.target.checked)}
                className="h-3 w-3 accent-blue-600 rounded bg-zinc-950 border-zinc-800"
              />
              AUTO STREAMING
            </label>
            <a
              href={market.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1 font-bold text-white hover:bg-blue-500 shadow-md shadow-blue-600/10 transition"
            >
              Trade on {P.name} ↗
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1680px] px-4 py-4">
        {/* Event Header */}
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4 border-b border-zinc-900 pb-4">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="relative shrink-0 mt-0.5">
              {!market.image_url ? (
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded bg-gradient-to-br ${P.gradient} font-black text-white border border-zinc-800 text-sm`}
                >
                  {init2(market.question)}
                </div>
              ) : (
                <img
                  src={market.image_url}
                  alt=""
                  className="h-10 w-10 rounded object-cover border border-zinc-800"
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-md font-bold text-white leading-tight tracking-tight">{market.question}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[9px] text-zinc-400 font-bold uppercase">
                <span className="rounded bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 text-zinc-500">{market.category}</span>
                <span className="rounded bg-zinc-900 border border-zinc-800 px-1.5 py-0.5">Platform: {market.platform}</span>
                <span className="rounded bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 text-blue-400">Vol 24h: {fmtN(market.volume_24h)}</span>
                <span className="rounded bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 text-emerald-400">Liq depth: {fmtN(liq)}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="rounded border border-emerald-950 bg-emerald-950/20 px-3.5 py-1.5 text-center min-width-[85px]">
              <div className="text-[8px] font-bold text-emerald-500 uppercase tracking-wide">YES Price</div>
              <div className="mt-0.5 font-mono text-base font-black text-emerald-400 tabular-nums">{yP}¢</div>
            </div>
            <div className="rounded border border-red-950 bg-red-950/20 px-3.5 py-1.5 text-center min-width-[85px]">
              <div className="text-[8px] font-bold text-red-500 uppercase tracking-wide">NO Price</div>
              <div className="mt-0.5 font-mono text-base font-black text-red-400 tabular-nums">{nP}¢</div>
            </div>
          </div>
        </div>

        {/* 3-Column Layout */}
        <div className="grid gap-4 lg:grid-cols-[280px_1fr_340px]">
          {/* Column 1: Info, rulebooks, newssentiment (Left) */}
          <div className="space-y-3.5">
            <div className="rounded border border-zinc-900 bg-zinc-950 p-3 text-[10px]">
              <h3 className="mb-2.5 font-black uppercase text-white tracking-tight text-[10px]">📊 SCANNED ANALYTICS</h3>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  ['Volume 24h', fmtN(market.volume_24h)],
                  ['Liquidity', fmtN(liq)],
                  ['Market Cap', fmtN(market.mcap)],
                  ['Txns Count', market.txns.toLocaleString()],
                  ['Unique Traders', market.traders.toLocaleString()],
                  ['Open Interest', fmtN(Math.round(liq * 0.78))],
                ].map(([label, val]) => (
                  <div key={label} className="rounded border border-zinc-900 bg-[#090d11] p-1.5">
                    <div className="text-[8px] font-bold uppercase text-zinc-500 tracking-wide">{label}</div>
                    <div className="mt-0.5 font-black text-slate-200 text-[10px] tabular-nums">{val}</div>
                  </div>
                ))}
              </div>
            </div>

            <ResolutionRulesWidget category={market.category} />

            <NewsSentimentTicker category={market.category} />

            <div className="rounded border border-zinc-900 bg-zinc-950 p-3 text-[10px]">
              <h3 className="mb-2 font-black uppercase text-white tracking-tight">ℹ️ SYSTEM REGISTRY</h3>
              <div className="space-y-1.5">
                <div className="flex justify-between text-zinc-500">
                  <span>AGE</span>
                  <span className="text-white font-bold">{fmtAge(market.age_hours)}</span>
                </div>
                <div className="flex justify-between text-zinc-500">
                  <span>PLATFORM</span>
                  <span className="text-white font-bold capitalize">{market.platform}</span>
                </div>
                <div className="flex justify-between text-zinc-500">
                  <span>OUTCOMES</span>
                  <span className="text-blue-400 font-bold">YES / NO</span>
                </div>
              </div>
            </div>
          </div>

          {/* Column 2: Canvas Probability trajectory paired with volume bars (Center) */}
          <div className="space-y-4 min-w-0">
            <div className="rounded border border-zinc-900 bg-zinc-950/40 backdrop-blur-md">
              <div className="flex items-center justify-between border-b border-zinc-900 px-3.5 py-2.5 bg-zinc-950/60">
                <h3 className="text-[10px] font-black uppercase text-white flex items-center gap-1.5">
                  <span className="text-blue-500">📈</span> PROBABILITY TRAJECTORY (15h ticks)
                </h3>
                <div className="flex items-center gap-4 text-[9px] font-bold">
                  <span className="flex items-center gap-1 text-emerald-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_4px_#10b981]" />
                    YES {yP}%
                  </span>
                  <span className="flex items-center gap-1 text-red-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 shadow-[0_0_4px_#ef4444]" />
                    NO {nP}%
                  </span>
                </div>
              </div>
              <div style={{ height: 350 }} className="relative">
                {chart.length > 1 ? (
                  <ProbChart data={chart} yP={yP} nP={nP} />
                ) : (
                  <div className="flex h-full items-center justify-center text-[10px] text-zinc-500">
                    GENERATING SIGNAL PLOT FROM TXN LOGS...
                  </div>
                )}
              </div>
            </div>

            {/* Live transactions ledger */}
            <div className="rounded border border-zinc-900 bg-zinc-950/60 backdrop-blur-sm">
              <div className="flex items-center justify-between border-b border-zinc-900 px-3.5 py-2 bg-zinc-950/90">
                <h3 className="text-[10px] font-black uppercase text-white">⚡ LIVE SIGNAL TRANSACTION FEED</h3>
                <div className="flex rounded border border-zinc-800 overflow-hidden text-[9px] font-bold">
                  <button
                    onClick={() => setFilter('all')}
                    className={`px-2.5 py-0.5 transition ${
                      filter === 'all' ? 'bg-blue-600 text-white font-black' : 'bg-zinc-950 text-slate-400 hover:text-white'
                    }`}
                  >
                    ALL
                  </button>
                  <button
                    onClick={() => setFilter('whales')}
                    className={`px-2.5 py-0.5 transition ${
                      filter === 'whales' ? 'bg-amber-600 text-white font-black' : 'bg-zinc-950 text-slate-400 hover:text-white'
                    }`}
                  >
                    🐋 WHALES
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto max-h-[300px] overflow-y-auto scrollbar-thin">
                <table className="w-full text-left text-[10px]">
                  <thead>
                    <tr className="border-b border-zinc-900 bg-zinc-900/10 text-[9px] uppercase tracking-wider text-zinc-500">
                      <th className="px-3 py-2 font-semibold">Time</th>
                      <th className="px-2 py-2 font-semibold text-center">Type</th>
                      <th className="px-2 py-2 font-semibold text-center">Side</th>
                      <th className="px-2 py-2 text-right font-semibold">Price</th>
                      <th className="px-2 py-2 text-right font-semibold">Total USD</th>
                      <th className="px-2 py-2 text-right font-semibold">Shares</th>
                      <th className="px-3 py-2 font-semibold">Account</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ft.slice(0, 30).map((t, i) => {
                      const isNew = flash.has(t.id);
                      const ts = new Date(t.timestamp * 1000).toLocaleTimeString('en-US', {
                        hour12: false,
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      });

                      let flashRowClass = '';
                      if (isNew) {
                        flashRowClass = t.side === 'BUY' ? 'bg-[#10b981]/15 text-[#10b981]' : 'bg-[#ef4444]/15 text-[#ef4444]';
                      }

                      return (
                        <tr
                          key={`${t.id}-${i}`}
                          className={`border-b border-zinc-900 transition-colors duration-500 hover:bg-zinc-900/30 font-mono ${flashRowClass}`}
                        >
                          <td className="px-3 py-1.5 text-zinc-500 tabular-nums">{ts}</td>
                          <td className="px-2 py-1.5 text-center">
                            <span
                              className="rounded px-1.5 py-0.5 text-[8px] font-black"
                              style={{
                                background: t.side === 'BUY' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                                color: t.side === 'BUY' ? '#10b981' : '#ef4444',
                              }}
                            >
                              {t.side}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <span className={`font-bold ${t.outcome === 'YES' ? 'text-emerald-400' : 'text-red-400'}`}>
                              {t.outcome}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-right text-slate-200 tabular-nums">
                            {(t.price * 100).toFixed(0)}¢
                          </td>
                          <td className="px-2 py-1.5 text-right font-bold text-white tabular-nums">
                            {fmtN(t.total_value)}
                          </td>
                          <td className="px-2 py-1.5 text-right text-zinc-400 tabular-nums">
                            {t.size.toLocaleString()}
                          </td>
                          <td
                            className="px-3 py-1.5 text-zinc-600 hover:text-blue-500 font-bold transition-colors cursor-pointer truncate max-w-[100px]"
                            title={t.wallet}
                            onClick={() => navigator.clipboard?.writeText(t.wallet)}
                          >
                            {t.wallet?.substring(0, 6)}...{t.wallet?.substring(t.wallet.length - 4)}
                          </td>
                        </tr>
                      );
                    })}
                    {ft.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-zinc-600 uppercase font-black text-[9px]">
                          Waiting for live transaction feed stream...
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Column 3: Sticky terminal and micro order book (Right) */}
          <div className="space-y-4 lg:relative">
            <div className="lg:sticky lg:top-[68px] space-y-3.5">
              {/* Trading Terminal Widget */}
              <div className="rounded border border-zinc-900 bg-zinc-950 p-3.5 shadow-lg relative">
                <div className="mb-3.5 text-[10px] font-black uppercase text-white tracking-tight flex items-center gap-1.5">
                  <span className="text-blue-500">💰</span> EXECUTION TERMINAL
                </div>

                {/* YES/NO Switch */}
                <div className="flex rounded border border-zinc-900 p-0.5 bg-[#090d11] mb-3.5">
                  <button
                    onClick={() => setContractSide('YES')}
                    className={`flex-1 py-2 font-mono text-[10px] font-black tracking-wider uppercase transition rounded ${
                      contractSide === 'YES'
                        ? 'bg-emerald-950 border border-emerald-900/30 text-emerald-400'
                        : 'text-zinc-500 hover:text-slate-200'
                    }`}
                  >
                    YES (Buy {yP}¢)
                  </button>
                  <button
                    onClick={() => setContractSide('NO')}
                    className={`flex-1 py-2 font-mono text-[10px] font-black tracking-wider uppercase transition rounded ${
                      contractSide === 'NO'
                        ? 'bg-red-950 border border-red-900/30 text-red-400'
                        : 'text-zinc-500 hover:text-slate-200'
                    }`}
                  >
                    NO (Buy {nP}¢)
                  </button>
                </div>

                {/* Investment Input */}
                <div className="mb-3.5 space-y-1.5 font-mono">
                  <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wide">Investment USD</label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-zinc-600 font-bold">$</span>
                    <input
                      type="number"
                      value={investment}
                      onChange={(e) => setInvestment(e.target.value)}
                      placeholder="0.00"
                      className="w-full rounded border border-zinc-900 bg-[#090d11] py-2 pl-7 pr-3 text-[11px] font-black text-white outline-none hover:border-zinc-800 transition"
                    />
                  </div>
                </div>

                {/* Financial calculations */}
                <div className="space-y-1.5 border-t border-zinc-900 pt-3 text-[10px] font-mono mb-4">
                  <div className="flex justify-between text-zinc-500">
                    <span>IMPLIED PROBABILITY</span>
                    <span className="text-white font-bold">{contractSide === 'YES' ? yP : nP}%</span>
                  </div>
                  <div className="flex justify-between text-zinc-500">
                    <span>CONTRACT PRICE</span>
                    <span className="text-white font-bold">{sharePrice.toFixed(2)} USD</span>
                  </div>
                  <div className="flex justify-between text-zinc-500">
                    <span>ESTIMATED SHARES</span>
                    <span className="text-blue-400 font-bold tabular-nums">
                      {targetShares.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                    </span>
                  </div>
                  <div className="flex justify-between text-zinc-500">
                    <span>SLIPPAGE ESTIMATE</span>
                    <span className={`font-bold tabular-nums ${slippage > 2.0 ? 'text-amber-500' : 'text-zinc-400'}`}>
                      {slippage.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between text-zinc-500 border-t border-zinc-900 pt-2 mt-1">
                    <span className="font-bold text-slate-400">MAX PAYOUT</span>
                    <span className="text-emerald-400 font-black tabular-nums">
                      {fmtN(maxPayout)}
                    </span>
                  </div>
                  <div className="flex justify-between text-zinc-500">
                    <span className="font-bold text-slate-400">MAX ROI POTENTIAL</span>
                    <span className="text-emerald-400 font-black tabular-nums">
                      +{maxRoi.toFixed(1)}%
                    </span>
                  </div>
                </div>

                <a
                  href={market.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block w-full py-2.5 text-center font-mono font-black text-[10px] uppercase text-white rounded bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-600/10 hover:shadow-blue-600/25 transition duration-150"
                >
                  EXECUTE ORDER ON {market.platform.toUpperCase()} ↗
                </a>
              </div>

              {/* Micro Order Book Component */}
              <div
                className={`rounded border border-zinc-900 bg-zinc-950 p-3.5 shadow-md font-mono text-[9px] transition-all duration-300 ${
                  flashOrderBook ? 'bg-zinc-900/60 shadow-[0_0_8px_rgba(59,130,246,0.08)]' : ''
                }`}
              >
                <div className="mb-2 text-[10px] font-black uppercase text-white tracking-tight flex items-center justify-between">
                  <span>📒 ORDER DEPTH ({contractSide})</span>
                  <span className="font-bold text-slate-500 text-[8px]">SPREAD: 1¢</span>
                </div>

                {/* Asks (Asks go down in price to bid, sorted price desc) */}
                <div className="space-y-1">
                  {orderBook.asks.slice().reverse().map((ask, idx) => (
                    <div key={`ask-${idx}`} className="flex items-center text-red-400 transition-colors">
                      <span className="w-12 font-bold">{ask.price}¢</span>
                      <span className="flex-1 text-right tabular-nums text-zinc-500">{ask.size.toLocaleString()}</span>
                      <span className="w-16 text-right tabular-nums text-zinc-600 font-bold">{ask.total.toLocaleString()}</span>
                    </div>
                  ))}
                </div>

                {/* Spread Separator */}
                <div className="my-2 border-y border-zinc-900 py-1 flex items-center justify-between text-zinc-500 text-[8.5px] font-bold">
                  <span>MID PRICE</span>
                  <span className="text-white font-black">
                    {contractSide === 'YES' ? market.yes_price : market.no_price}¢
                  </span>
                </div>

                {/* Bids */}
                <div className="space-y-1">
                  {orderBook.bids.map((bid, idx) => (
                    <div key={`bid-${idx}`} className="flex items-center text-emerald-400 transition-colors">
                      <span className="w-12 font-bold">{bid.price}¢</span>
                      <span className="flex-1 text-right tabular-nums text-zinc-500">{bid.size.toLocaleString()}</span>
                      <span className="w-16 text-right tabular-nums text-zinc-600 font-bold">{bid.total.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
