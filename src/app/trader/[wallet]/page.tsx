'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { PageShell } from '@/components/ui/page-shell';

// ── Types ────────────────────────────────────────────────────
interface TradeRecord {
  pnl: number;
  entryPrice: number;
  exitPrice: number;
  size: number;
  entryTime: number;
  exitTime: number;
  side: string;
  market: string;
  outcome: string;
  transactionHash?: string;
}

interface PositionRecord {
  market: string;
  outcome: string;
  size: number;
  avgPrice: number;
  curPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
}

interface ActivityRecord {
  type: string;
  timestamp: number;
  market: string;
  side: string;
  size: number;
  usdcSize: number;
}

interface TraderProfile {
  wallet: string;
  displayName: string | null;
  pseudonym: string | null;
  bio: string | null;
  profileImage: string | null;
  xUsername: string | null;
  verifiedBadge: boolean;
  polymarketUrl: string;
  trustScore: number;
  edgeScore: number;
  masterScore: number;
  winRate: number;
  roi: number;
  maxDrawdown: number;
  consistency: number;
  profitFactor: number;
  riskLevel: string;
  timingScore: number;
  totalTrades: number;
  activityDays: number;
  avgTradeSize: number;
  totalVolumeUsd: number;
  netPnl: number;
  avgHoldTime: number;
  bestTrade: number;
  worstTrade: number;
  winStreak: number;
  lossStreak: number;
  sharpeRatio: number;
  categories: string[];
  scoreBreakdown: {
    trustScore: {
      roiComponent: number;
      consistencyComponent: number;
      drawdownComponent: number;
      activityComponent: number;
      formula: string;
    };
    edgeScore: {
      roiComponent: number;
      consistencyComponent: number;
      riskComponent: number;
      timingComponent: number;
      volumeComponent: number;
      formula: string;
    };
    masterScore: {
      accuracyComponent: number;
      roiComponent: number;
      tradesComponent: number;
      formula: string;
    };
  };
  recentTrades: TradeRecord[];
  openPositions: PositionRecord[];
  recentActivity: ActivityRecord[];
  monthlyReturns: { month: string; pnl: number; trades: number }[];
  equityCurve: number[];
  hourlyDistribution: number[];
  categoryBreakdown: { category: string; trades: number; winRate: number; pnl: number }[];
  strategyInsights: {
    preferredSide: string;
    avgEntryPrice: number;
    avgExitSpread: number;
    marketDiversification: number;
    timingEfficiency: number;
    riskAppetite: string;
  };
  dataSource: 'polymarket_api' | 'mock_deterministic';
  lastUpdated: string;
}

// Helper formats
const fmtUSD = (n: number) => {
  if (n === 0 || isNaN(n)) return '$0.00';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(2)}`;
};

const fmtN = (n: number) => {
  if (n === 0 || isNaN(n)) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
};

const clsPnL = (n: number) => (n > 0 ? 'text-emerald-400' : n < 0 ? 'text-red-400' : 'text-zinc-400');
const clsPnLBg = (n: number) => (n > 0 ? 'bg-emerald-500/10 border-emerald-500/20' : n < 0 ? 'bg-red-500/10 border-red-500/20' : 'bg-zinc-800/10 border-zinc-800/20');

export default function TraderProfilePageClient() {
  const params = useParams();
  const wallet = (params?.wallet as string) || '';

  const [trader, setTrader] = useState<TraderProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'positions' | 'trades' | 'categories' | 'insights'>('overview');
  
  // Trades pagination
  const [tradePage, setTradePage] = useState(1);
  const tradesPerPage = 15;

  const fetchTraderData = async () => {
    if (!wallet) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/trader/${wallet}`);
      if (!res.ok) {
        throw new Error(`Failed to load profile. Error: ${res.status}`);
      }
      const data = await res.json();
      if (data.success && data.trader) {
        setTrader(data.trader);
      } else {
        throw new Error(data.error || 'Failed to retrieve profile data.');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An unexpected error occurred while loading trader profile.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTraderData();
  }, [wallet]);

  const copyWallet = () => {
    if (!wallet) return;
    navigator.clipboard.writeText(wallet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // SVG Equity curve calculator
  const equitySvgPath = useMemo(() => {
    if (!trader || !trader.equityCurve || trader.equityCurve.length < 2) return '';
    const data = trader.equityCurve;
    const width = 800;
    const height = 240;
    const padding = 20;

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    const points = data.map((val, idx) => {
      const x = padding + (idx / (data.length - 1)) * (width - 2 * padding);
      const y = height - padding - ((val - min) / range) * (height - 2 * padding);
      return `${x},${y}`;
    });

    return {
      line: `M ${points.join(' L ')}`,
      area: `M ${padding},${height - padding} L ${points.join(' L ')} L ${width - padding},${height - padding} Z`,
      points: points
    };
  }, [trader]);

  // Loading skeletons
  if (loading) {
    return (
      <PageShell showCategoryNav={false}>
        <div className="mx-auto max-w-7xl px-4 py-8 space-y-6 animate-pulse">
          {/* Header Skeleton */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-zinc-850" />
              <div className="space-y-2">
                <div className="h-6 w-48 rounded bg-zinc-850" />
                <div className="h-4 w-32 rounded bg-zinc-850" />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="h-10 w-24 rounded bg-zinc-850" />
              <div className="h-10 w-24 rounded bg-zinc-850" />
            </div>
          </div>

          {/* Scores Skeleton */}
          <div className="grid gap-4 sm:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-36 rounded-2xl border border-zinc-800 bg-zinc-950 p-6 space-y-3" />
            ))}
          </div>

          {/* Charts Skeleton */}
          <div className="h-64 rounded-2xl border border-zinc-800 bg-zinc-950" />

          {/* Tables Skeleton */}
          <div className="h-80 rounded-2xl border border-zinc-800 bg-zinc-950" />
        </div>
      </PageShell>
    );
  }

  // Error state
  if (error || !trader) {
    return (
      <PageShell showCategoryNav={false}>
        <div className="mx-auto max-w-xl px-4 py-20 text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 text-red-500 border border-red-500/20 mb-6">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-zinc-150 mb-2">Could Not Load Profile</h2>
          <p className="text-zinc-400 text-sm mb-6 max-w-md mx-auto">{error || 'The trader profile has no transactions or database sync failed.'}</p>
          <div className="flex justify-center gap-3">
            <Link href="/leaderboard" className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-zinc-300 hover:bg-zinc-850 transition">
              Return to Leaderboard
            </Link>
            <button onClick={fetchTraderData} className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-550 transition shadow-lg shadow-indigo-600/15">
              Retry Sync
            </button>
          </div>
        </div>
      </PageShell>
    );
  }

  // Active calculations derived
  const name = trader.displayName || trader.pseudonym || `Forecaster#${wallet.slice(2, 6)}`;
  
  // Custom badges
  const badges = [];
  if (trader.winRate >= 70) badges.push({ text: 'High Accuracy', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' });
  if (trader.totalTrades >= 500) badges.push({ text: 'High Volume Degen', color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' });
  if (trader.maxDrawdown < 12) badges.push({ text: 'Risk Shield', color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' });
  if (trader.roi >= 60) badges.push({ text: 'Extreme ROI', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' });
  if (trader.consistency >= 75) badges.push({ text: 'Steady Growth', color: 'bg-pink-500/10 text-pink-400 border-pink-500/20' });
  if (trader.dataSource === 'mock_deterministic') badges.push({ text: 'Mock Oracle Data', color: 'bg-zinc-800 text-zinc-400 border-zinc-700' });
  else badges.push({ text: 'Real API Data', color: 'bg-teal-500/10 text-teal-400 border-teal-500/20' });

  // Pagination slice
  const startIndex = (tradePage - 1) * tradesPerPage;
  const paginatedTrades = trader.recentTrades.slice(startIndex, startIndex + tradesPerPage);
  const totalTradePages = Math.ceil(trader.recentTrades.length / tradesPerPage) || 1;

  return (
    <PageShell showCategoryNav={false}>
      <div className="mx-auto max-w-7xl px-4 py-8 space-y-6">
        
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Link href="/leaderboard" className="hover:text-zinc-200 transition">Intelligence Leaderboard</Link>
          <span>/</span>
          <span className="text-zinc-200">Trader Profile</span>
        </div>

        {/* ── SECTION 1: HEADER USER PANEL ────────────────────────────────── */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 backdrop-blur p-6 relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="absolute top-0 right-0 h-48 w-48 rounded-full bg-indigo-500/5 blur-3xl" />
          
          <div className="flex items-center gap-5 relative z-10">
            {/* Deterministic Gradient Avatar */}
            <div className={`h-16 w-16 rounded-full flex items-center justify-center font-bold text-2xl text-white shadow border border-zinc-700 bg-gradient-to-tr ${
              parseInt(wallet.slice(3, 5), 16) % 3 === 0 ? 'from-indigo-650 to-pink-500' :
              parseInt(wallet.slice(3, 5), 16) % 3 === 1 ? 'from-emerald-500 to-cyan-500' :
              'from-purple-600 to-indigo-500'
            }`}>
              {name.charAt(0).toUpperCase()}
            </div>
            
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">{name}</h1>
                {trader.verifiedBadge && (
                  <span className="inline-flex items-center rounded-full bg-emerald-500/15 p-1 text-emerald-400 border border-emerald-500/20" title="Verified Trader">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                    </svg>
                  </span>
                )}
              </div>
              
              <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-400">
                <div className="flex items-center gap-1.5 font-mono bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded text-zinc-300">
                  <span>{wallet.slice(0, 8)}…{wallet.slice(-6)}</span>
                  <button onClick={copyWallet} className="hover:text-white transition">
                    {copied ? (
                      <span className="text-xs text-emerald-400">Copied</span>
                    ) : (
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    )}
                  </button>
                </div>
                {trader.xUsername && (
                  <a href={`https://x.com/${trader.xUsername}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-zinc-200 transition">
                    <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                    <span>@{trader.xUsername}</span>
                  </a>
                )}
              </div>

              {trader.bio && (
                <p className="text-sm text-zinc-400 mt-2 max-w-xl leading-relaxed">{trader.bio}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 md:self-center relative z-10">
            {badges.map((b, idx) => (
              <span key={idx} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold tracking-wide ${b.color}`}>
                {b.text}
              </span>
            ))}
            <a href={trader.polymarketUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-200 px-3.5 py-1.5 text-xs font-semibold transition flex items-center gap-1">
              Polymarket ↗
            </a>
          </div>
        </div>

        {/* ── SECTION 2: INTELLIGENCE SCORE BOARDS ────────────────────────── */}
        <div className="grid gap-4 md:grid-cols-3">
          
          {/* Master Score ⚡ */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 flex flex-col justify-between relative overflow-hidden group hover:border-zinc-700 transition">
            <div className="absolute top-0 right-0 h-24 w-24 rounded-full bg-amber-500/5 blur-xl pointer-events-none" />
            <div>
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Master Score</h3>
                  <p className="text-xs text-zinc-500 font-mono mt-0.5">Unified Intelligence Rating</p>
                </div>
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-400 border border-amber-500/20">⚡ Master</span>
              </div>
              <div className="flex items-baseline gap-2 mt-4">
                <span className="text-4xl font-extrabold text-amber-400 tracking-tight">{trader.masterScore.toFixed(1)}</span>
                <span className="text-zinc-500 text-sm font-mono">/100</span>
              </div>
            </div>
            
            <div className="mt-5 pt-3 border-t border-zinc-900 space-y-2">
              <div className="flex justify-between text-xs text-zinc-400">
                <span>Accuracy Component (50%):</span>
                <span className="font-mono text-zinc-300">{trader.scoreBreakdown.masterScore.accuracyComponent.toFixed(1)}</span>
              </div>
              <div className="flex justify-between text-xs text-zinc-400">
                <span>ROI Component (30%):</span>
                <span className="font-mono text-zinc-300">{trader.scoreBreakdown.masterScore.roiComponent.toFixed(1)}</span>
              </div>
              <div className="flex justify-between text-xs text-zinc-400">
                <span>Trades Component (20%):</span>
                <span className="font-mono text-zinc-300">{trader.scoreBreakdown.masterScore.tradesComponent.toFixed(1)}</span>
              </div>
              <div className="text-[10px] text-zinc-500 font-mono bg-zinc-900/50 p-1.5 rounded leading-normal">
                {trader.scoreBreakdown.masterScore.formula}
              </div>
            </div>
          </div>

          {/* Edge Score 🧠 */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 flex flex-col justify-between relative overflow-hidden group hover:border-zinc-700 transition">
            <div className="absolute top-0 right-0 h-24 w-24 rounded-full bg-indigo-500/5 blur-xl pointer-events-none" />
            <div>
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Edge Score</h3>
                  <p className="text-xs text-zinc-500 font-mono mt-0.5">DexScreener Edge Index</p>
                </div>
                <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-xs font-semibold text-indigo-400 border border-indigo-500/20">🧠 Edge</span>
              </div>
              <div className="flex items-baseline gap-2 mt-4">
                <span className="text-4xl font-extrabold text-indigo-400 tracking-tight">{trader.edgeScore.toFixed(1)}</span>
                <span className="text-zinc-500 text-sm font-mono">/100</span>
              </div>
            </div>
            
            <div className="mt-5 pt-3 border-t border-zinc-900 space-y-2">
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-zinc-400">
                <div className="flex justify-between">
                  <span>ROI:</span>
                  <span className="font-mono text-zinc-300">{(trader.scoreBreakdown.edgeScore.roiComponent).toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Cons:</span>
                  <span className="font-mono text-zinc-300">{(trader.scoreBreakdown.edgeScore.consistencyComponent).toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Risk:</span>
                  <span className="font-mono text-zinc-300">{(trader.scoreBreakdown.edgeScore.riskComponent).toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Time:</span>
                  <span className="font-mono text-zinc-300">{(trader.scoreBreakdown.edgeScore.timingComponent).toFixed(1)}</span>
                </div>
                <div className="flex justify-between col-span-2 mt-0.5 pt-0.5 border-t border-dashed border-zinc-900">
                  <span>Volume Contribution:</span>
                  <span className="font-mono text-zinc-300">{(trader.scoreBreakdown.edgeScore.volumeComponent).toFixed(1)}</span>
                </div>
              </div>
              <div className="text-[10px] text-zinc-500 font-mono bg-zinc-900/50 p-1.5 rounded leading-normal">
                {trader.scoreBreakdown.edgeScore.formula}
              </div>
            </div>
          </div>

          {/* Trust Score 🛡️ */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 flex flex-col justify-between relative overflow-hidden group hover:border-zinc-700 transition">
            <div className="absolute top-0 right-0 h-24 w-24 rounded-full bg-emerald-500/5 blur-xl pointer-events-none" />
            <div>
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Trust Score</h3>
                  <p className="text-xs text-zinc-500 font-mono mt-0.5">Capital Safety Index</p>
                </div>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20">🛡️ Safety</span>
              </div>
              <div className="flex items-baseline gap-2 mt-4">
                <span className="text-4xl font-extrabold text-emerald-400 tracking-tight">{trader.trustScore.toFixed(1)}</span>
                <span className="text-zinc-500 text-sm font-mono">/100</span>
              </div>
            </div>
            
            <div className="mt-5 pt-3 border-t border-zinc-900 space-y-2">
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-zinc-400">
                <div className="flex justify-between">
                  <span>ROI:</span>
                  <span className="font-mono text-zinc-300">{trader.scoreBreakdown.trustScore.roiComponent.toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Cons:</span>
                  <span className="font-mono text-zinc-300">{trader.scoreBreakdown.trustScore.consistencyComponent.toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Risk DD:</span>
                  <span className="font-mono text-zinc-300">{trader.scoreBreakdown.trustScore.drawdownComponent.toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Act:</span>
                  <span className="font-mono text-zinc-300">{trader.scoreBreakdown.trustScore.activityComponent.toFixed(1)}</span>
                </div>
              </div>
              <div className="text-[10px] text-zinc-500 font-mono bg-zinc-900/50 p-1.5 rounded leading-normal">
                {trader.scoreBreakdown.trustScore.formula}
              </div>
            </div>
          </div>

        </div>

        {/* ── SECTION 3: DEX KEY METRICS OVERVIEW ─────────────────────────── */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">ROI %</p>
            <p className={`text-xl font-bold mt-1 ${clsPnL(trader.roi)}`}>
              {trader.roi >= 0 ? '+' : ''}{trader.roi.toFixed(1)}%
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">Accuracy (Win Rate)</p>
            <p className="text-xl font-bold text-zinc-200 mt-1">
              {trader.winRate.toFixed(1)}%
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">Est. Net Profit</p>
            <p className={`text-xl font-bold mt-1 ${clsPnL(trader.netPnl)}`}>
              {fmtUSD(trader.netPnl)}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">Total Volume</p>
            <p className="text-xl font-bold text-zinc-200 mt-1">
              {fmtUSD(trader.totalVolumeUsd)}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">Profit Factor</p>
            <p className="text-xl font-bold text-zinc-200 mt-1">
              {trader.profitFactor.toFixed(2)}x
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">Sharpe Ratio</p>
            <p className="text-xl font-bold text-zinc-200 mt-1">
              {trader.sharpeRatio.toFixed(2)}
            </p>
          </div>
        </div>

        {/* ── SECTION 4: CHARTS GRID ───────────────────────────────────────── */}
        <div className="grid gap-4 md:grid-cols-3">
          
          {/* Equity Curve SVG Line Chart */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 md:col-span-2 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-bold text-zinc-200">Equity Curve (PnL progression)</h3>
                <p className="text-xs text-zinc-500">Visual performance trail over past active trades</p>
              </div>
              <span className={`text-xs font-mono font-bold ${clsPnL(trader.netPnl)}`}>
                Latest PnL: {trader.netPnl >= 0 ? '+' : ''}{trader.netPnl.toFixed(2)} USDC
              </span>
            </div>
            
            <div className="h-60 w-full relative pt-2">
              {equitySvgPath ? (
                <svg viewBox="0 0 800 240" className="w-full h-full overflow-visible">
                  <defs>
                    <linearGradient id="pnl-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#818cf8" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#818cf8" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  
                  {/* Grid Lines */}
                  {[0, 60, 120, 180, 220].map((y, idx) => (
                    <line key={idx} x1="20" y1={y} x2="780" y2={y} stroke="#27272a" strokeWidth="1" strokeDasharray="4 4" />
                  ))}

                  {/* Shaded Area Under Line */}
                  <path d={equitySvgPath.area} fill="url(#pnl-grad)" />

                  {/* Curve Line */}
                  <path d={equitySvgPath.line} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

                  {/* Start/End Highlights */}
                  {equitySvgPath.points.length > 0 && (
                    <>
                      {/* Start Point */}
                      <circle cx={equitySvgPath.points[0].split(',')[0]} cy={equitySvgPath.points[0].split(',')[1]} r="4" fill="#a5b4fc" stroke="#312e81" strokeWidth="2" />
                      {/* End Point */}
                      <circle cx={equitySvgPath.points[equitySvgPath.points.length - 1].split(',')[0]} cy={equitySvgPath.points[equitySvgPath.points.length - 1].split(',')[1]} r="6" fill="#818cf8" stroke="#1e1b4b" strokeWidth="2" />
                    </>
                  )}
                </svg>
              ) : (
                <div className="h-full flex items-center justify-center text-zinc-650 text-sm">No equity progression points recorded.</div>
              )}
            </div>
          </div>

          {/* Monthly returns bar chart */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 space-y-4">
            <div>
              <h3 className="font-bold text-zinc-200 font-medium">Monthly Performance</h3>
              <p className="text-xs text-zinc-500">Gross monthly profit/loss distribution</p>
            </div>

            <div className="h-60 flex items-end justify-between gap-3 pt-6 relative px-2">
              <div className="absolute inset-y-0 left-0 right-0 flex flex-col justify-between pointer-events-none">
                <div className="border-b border-zinc-900 w-full h-0" />
                <div className="border-b border-zinc-900 border-dashed w-full h-0" />
                <div className="border-b border-zinc-850 w-full h-0" />
                <div className="border-b border-zinc-900 border-dashed w-full h-0" />
                <div className="border-b border-zinc-900 w-full h-0" />
              </div>

              {trader.monthlyReturns.length > 0 ? (
                trader.monthlyReturns.map((m, idx) => {
                  const maxPnL = Math.max(...trader.monthlyReturns.map(x => Math.abs(x.pnl))) || 1;
                  const pct = Math.min(100, (Math.abs(m.pnl) / maxPnL) * 90);
                  const isPositive = m.pnl >= 0;
                  
                  return (
                    <div key={idx} className="flex flex-col items-center flex-1 group relative h-full justify-end">
                      
                      {/* Tooltip */}
                      <div className="absolute -top-7 scale-0 group-hover:scale-100 bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-200 px-2 py-1 rounded shadow-lg pointer-events-none transition-all z-20 whitespace-nowrap">
                        <p className="font-bold">{isPositive ? '+' : ''}{m.pnl.toFixed(0)} USDC</p>
                        <p className="text-[9px] text-zinc-500">{m.trades} trades</p>
                      </div>

                      {/* Bar wrapper */}
                      <div className="w-full flex flex-col justify-center h-[180px] relative items-center">
                        <div 
                          className={`w-4 sm:w-6 rounded-sm transition-all duration-300 absolute ${
                            isPositive 
                              ? 'bg-emerald-500/20 border-t-2 border-emerald-400 bottom-[90px]' 
                              : 'bg-red-500/20 border-b-2 border-red-400 top-[90px]'
                          }`}
                          style={{ height: `${pct * 0.9}px` }}
                        />
                      </div>
                      
                      {/* Label */}
                      <span className="text-[9px] font-mono text-zinc-500 mt-2 block">{m.month.slice(-2)}/{m.month.slice(2, 4)}</span>
                    </div>
                  );
                })
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-650 text-sm">No monthly stats available.</div>
              )}
            </div>
          </div>

        </div>

        {/* ── SECTION 5: INTERACTIVE TABS & DETAILS ──────────────────────── */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 overflow-hidden">
          
          {/* Tabs bar */}
          <div className="flex border-b border-zinc-850 bg-zinc-950/60 overflow-x-auto">
            <button onClick={() => setActiveTab('overview')} className={`px-5 py-4 text-xs font-bold uppercase tracking-wider border-b-2 transition whitespace-nowrap ${activeTab === 'overview' ? 'border-indigo-500 text-indigo-400 bg-indigo-500/[0.02]' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}>
              Overview & Timing
            </button>
            <button onClick={() => setActiveTab('positions')} className={`px-5 py-4 text-xs font-bold uppercase tracking-wider border-b-2 transition relative whitespace-nowrap ${activeTab === 'positions' ? 'border-indigo-500 text-indigo-400 bg-indigo-500/[0.02]' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}>
              Active Positions
              {trader.openPositions.length > 0 && (
                <span className="ml-2 rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold text-indigo-400 border border-indigo-500/30">
                  {trader.openPositions.length}
                </span>
              )}
            </button>
            <button onClick={() => setActiveTab('trades')} className={`px-5 py-4 text-xs font-bold uppercase tracking-wider border-b-2 transition whitespace-nowrap ${activeTab === 'trades' ? 'border-indigo-500 text-indigo-400 bg-indigo-500/[0.02]' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}>
              Recent Trades
            </button>
            <button onClick={() => setActiveTab('categories')} className={`px-5 py-4 text-xs font-bold uppercase tracking-wider border-b-2 transition whitespace-nowrap ${activeTab === 'categories' ? 'border-indigo-500 text-indigo-400 bg-indigo-500/[0.02]' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}>
              Category Breakdown
            </button>
            <button onClick={() => setActiveTab('insights')} className={`px-5 py-4 text-xs font-bold uppercase tracking-wider border-b-2 transition whitespace-nowrap ${activeTab === 'insights' ? 'border-indigo-500 text-indigo-400 bg-indigo-500/[0.02]' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}>
              Strategy & AI Verdict
            </button>
          </div>

          {/* Tab content */}
          <div className="p-6">
            
            {/* TAB 1: OVERVIEW & HOUR ACTIVITY */}
            {activeTab === 'overview' && (
              <div className="grid gap-6 md:grid-cols-3">
                <div className="md:col-span-2 space-y-5">
                  <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Trading Hour Distribution (UTC Heatmap)</h4>
                  <p className="text-xs text-zinc-500">Hourly density log of entries and exits, highlighting automated systems vs manual timezone trading.</p>
                  
                  <div className="h-48 flex items-end justify-between gap-1 pt-6 px-2 border-b border-zinc-900">
                    {trader.hourlyDistribution.length > 0 ? (
                      trader.hourlyDistribution.map((v, h) => {
                        const maxVal = Math.max(...trader.hourlyDistribution) || 1;
                        const pct = (v / maxVal) * 100;
                        const isHighActivity = pct > 70;
                        
                        return (
                          <div key={h} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                            <div className="absolute -top-7 scale-0 group-hover:scale-100 bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-200 px-1.5 py-0.5 rounded shadow pointer-events-none transition-all z-10 whitespace-nowrap">
                              {v} transactions
                            </div>
                            <div 
                              className={`w-full rounded-t-sm transition-all duration-300 ${
                                isHighActivity ? 'bg-indigo-500/30 hover:bg-indigo-400/50' : 'bg-zinc-800/40 hover:bg-zinc-700/60'
                              }`} 
                              style={{ height: `${Math.max(4, pct * 0.9)}%` }}
                            />
                            <span className="text-[8px] font-mono text-zinc-550 mt-1">{h.toString().padStart(2, '0')}</span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-650 text-sm">No hourly feed recorded.</div>
                    )}
                  </div>
                </div>

                {/* Additional metrics */}
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Streak & Hold Metrics</h4>
                  <div className="rounded-xl border border-zinc-900 bg-zinc-950 p-4 space-y-3">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-zinc-500">Best Trade Profit:</span>
                      <span className="font-bold text-emerald-400 font-mono">+{fmtUSD(trader.bestTrade)}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-zinc-500">Worst Trade Loss:</span>
                      <span className="font-bold text-red-400 font-mono">{fmtUSD(trader.worstTrade)}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-zinc-500">Max Win Streak:</span>
                      <span className="font-bold text-emerald-400 font-mono">{trader.winStreak} consecutive</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-zinc-500">Max Loss Streak:</span>
                      <span className="font-bold text-red-400 font-mono">{trader.lossStreak} consecutive</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-zinc-500">Average Hold Time:</span>
                      <span className="font-bold text-zinc-350 font-mono">{trader.avgHoldTime.toFixed(1)} hrs</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-zinc-500">Active Trading Days:</span>
                      <span className="font-bold text-zinc-350 font-mono">{trader.activityDays} days</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-zinc-500">Average Trade Size:</span>
                      <span className="font-bold text-zinc-350 font-mono">{fmtUSD(trader.avgTradeSize)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: ACTIVE POSITIONS */}
            {activeTab === 'positions' && (
              <div className="overflow-x-auto">
                {trader.openPositions.length > 0 ? (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-850 text-zinc-500 font-semibold">
                        <th className="pb-3 w-[45%]">Prediction Market / Asset</th>
                        <th className="pb-3">Selected Outcome</th>
                        <th className="pb-3 text-right">Holdings Size</th>
                        <th className="pb-3 text-right">Avg Entry Price</th>
                        <th className="pb-3 text-right">Current Price</th>
                        <th className="pb-3 text-right">Unrealized PnL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900 text-zinc-300 font-medium">
                      {trader.openPositions.map((p, idx) => (
                        <tr key={idx} className="hover:bg-zinc-900/30 transition-all">
                          <td className="py-3.5 pr-4 font-bold text-zinc-200">{p.market}</td>
                          <td className="py-3.5">
                            <span className="rounded bg-zinc-900 border border-zinc-800 px-2 py-0.5 font-bold text-indigo-400">
                              {p.outcome}
                            </span>
                          </td>
                          <td className="py-3.5 text-right font-mono text-zinc-300">{fmtN(p.size)} shares</td>
                          <td className="py-3.5 text-right font-mono">${p.avgPrice.toFixed(2)}</td>
                          <td className="py-3.5 text-right font-mono">${p.curPrice.toFixed(2)}</td>
                          <td className={`py-3.5 text-right font-bold font-mono ${clsPnL(p.unrealizedPnl)}`}>
                            {p.unrealizedPnl >= 0 ? '+' : ''}{p.unrealizedPnl.toFixed(2)} USDC
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-center py-10 text-zinc-500 space-y-1">
                    <p className="text-sm font-semibold">No Open Positions</p>
                    <p className="text-xs">This trader is currently 100% in cash or has no active positions on Polymarket.</p>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: RECENT TRADES */}
            {activeTab === 'trades' && (
              <div className="space-y-4">
                <div className="overflow-x-auto">
                  {trader.recentTrades.length > 0 ? (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-zinc-850 text-zinc-500 font-semibold">
                          <th className="pb-3 w-[45%]">Market Name</th>
                          <th className="pb-3">Action</th>
                          <th className="pb-3 text-right">Shares / Volume</th>
                          <th className="pb-3 text-right">Entry / Exit</th>
                          <th className="pb-3 text-right">Target Outcome</th>
                          <th className="pb-3 text-right">Realized PnL</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-900 text-zinc-300 font-medium">
                        {paginatedTrades.map((t, idx) => (
                          <tr key={idx} className="hover:bg-zinc-900/30 transition-all">
                            <td className="py-3.5 pr-4 font-bold text-zinc-200">
                              <span className="line-clamp-1">{t.market}</span>
                            </td>
                            <td className="py-3.5">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                t.side === 'BUY' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25' : 'bg-amber-500/10 text-amber-400 border border-amber-500/25'
                              }`}>
                                {t.side}
                              </span>
                            </td>
                            <td className="py-3.5 text-right font-mono text-zinc-300">
                              <div>{fmtN(t.size)} shares</div>
                              <div className="text-[10px] text-zinc-500">${(t.size * t.entryPrice).toFixed(0)} USDC</div>
                            </td>
                            <td className="py-3.5 text-right font-mono">
                              <div>${t.entryPrice.toFixed(2)}</div>
                              <div className="text-[10px] text-zinc-500">${t.exitPrice.toFixed(2)}</div>
                            </td>
                            <td className="py-3.5 text-right">
                              <span className="font-semibold text-zinc-400">{t.outcome}</span>
                            </td>
                            <td className={`py-3.5 text-right font-bold font-mono ${clsPnL(t.pnl)}`}>
                              {t.pnl >= 0 ? '+' : ''}{t.pnl.toFixed(2)} USDC
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="text-center py-10 text-zinc-500">No trading transaction log found.</div>
                  )}
                </div>

                {/* Pagination footer */}
                {trader.recentTrades.length > tradesPerPage && (
                  <div className="flex items-center justify-between pt-4 border-t border-zinc-900">
                    <span className="text-xs text-zinc-500">
                      Showing {startIndex + 1}-{Math.min(startIndex + tradesPerPage, trader.recentTrades.length)} of {trader.recentTrades.length} transactions
                    </span>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setTradePage(prev => Math.max(1, prev - 1))}
                        disabled={tradePage === 1}
                        className="rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 disabled:opacity-40 disabled:hover:bg-zinc-900 disabled:cursor-not-allowed px-3 py-1 text-xs font-semibold transition"
                      >
                        Previous
                      </button>
                      <button 
                        onClick={() => setTradePage(prev => Math.min(totalTradePages, prev + 1))}
                        disabled={tradePage === totalTradePages}
                        className="rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 disabled:opacity-40 disabled:hover:bg-zinc-900 disabled:cursor-not-allowed px-3 py-1 text-xs font-semibold transition"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: CATEGORY BREAKDOWN */}
            {activeTab === 'categories' && (
              <div className="space-y-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-850 text-zinc-500 font-semibold">
                        <th className="pb-3">Prediction Domain / Category</th>
                        <th className="pb-3 text-right">Executed Trades</th>
                        <th className="pb-3 text-right">Win Rate %</th>
                        <th className="pb-3 text-right">Estimated PnL</th>
                        <th className="pb-3 text-right w-[40%]">Activity Weight</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900 text-zinc-300 font-medium">
                      {trader.categoryBreakdown.map((c, idx) => {
                        const totalTrades = trader.categoryBreakdown.reduce((sum, item) => sum + item.trades, 0) || 1;
                        const pct = (c.trades / totalTrades) * 100;
                        
                        return (
                          <tr key={idx} className="hover:bg-zinc-900/30 transition-all">
                            <td className="py-3.5 pr-4 font-bold text-zinc-200 capitalize">{c.category}</td>
                            <td className="py-3.5 text-right font-mono">{c.trades} trades</td>
                            <td className="py-3.5 text-right font-bold font-mono">
                              <span className={c.winRate >= 55 ? 'text-emerald-400' : 'text-zinc-300'}>
                                {c.winRate.toFixed(1)}%
                              </span>
                            </td>
                            <td className={`py-3.5 text-right font-bold font-mono ${clsPnL(c.pnl)}`}>
                              {c.pnl >= 0 ? '+' : ''}{c.pnl.toFixed(2)} USDC
                            </td>
                            <td className="py-3.5 pl-8">
                              <div className="flex items-center gap-3">
                                <div className="flex-1 bg-zinc-900 border border-zinc-800 h-2.5 rounded overflow-hidden">
                                  <div className="bg-indigo-500 h-full rounded-r" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="font-mono text-zinc-500 text-[10px] w-8 text-right">{pct.toFixed(0)}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 5: AI INTELLIGENCE INSIGHTS & VERDICT */}
            {activeTab === 'insights' && (
              <div className="grid gap-6 md:grid-cols-2">
                
                {/* Tactical Stats & Diversification */}
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Tactical Strategy Profile</h4>
                  
                  <div className="rounded-xl border border-zinc-900 bg-zinc-950 p-4 divide-y divide-zinc-900 space-y-3">
                    <div className="flex justify-between items-center text-xs pb-3">
                      <div>
                        <p className="font-bold text-zinc-300">Action Bias</p>
                        <p className="text-[10px] text-zinc-500">Long/Short distribution equivalent</p>
                      </div>
                      <span className="font-mono bg-zinc-900 border border-zinc-800 text-indigo-400 font-bold px-2 py-0.5 rounded capitalize">
                        {trader.strategyInsights.preferredSide}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-xs py-3">
                      <div>
                        <p className="font-bold text-zinc-300">Avg Share Entry Cost</p>
                        <p className="text-[10px] text-zinc-500">Average cost basis per share</p>
                      </div>
                      <span className="font-mono text-zinc-200 font-bold">
                        ${trader.strategyInsights.avgEntryPrice.toFixed(2)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-xs py-3">
                      <div>
                        <p className="font-bold text-zinc-300">Average Profit Spread</p>
                        <p className="text-[10px] text-zinc-500">Average exit spread delta captured</p>
                      </div>
                      <span className="font-mono text-zinc-200 font-bold">
                        ${trader.strategyInsights.avgExitSpread.toFixed(2)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-xs py-3">
                      <div>
                        <p className="font-bold text-zinc-300">Market Diversification Index</p>
                        <p className="text-[10px] text-zinc-500">Execution spread across diverse conditions</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-zinc-900 h-2 rounded overflow-hidden border border-zinc-800">
                          <div className="bg-indigo-500 h-full" style={{ width: `${trader.strategyInsights.marketDiversification}%` }} />
                        </div>
                        <span className="font-mono text-zinc-200 font-bold">
                          {trader.strategyInsights.marketDiversification}%
                        </span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-xs pt-3">
                      <div>
                        <p className="font-bold text-zinc-300">Timing Efficiency Index</p>
                        <p className="text-[10px] text-zinc-500">Time-of-day execution stability</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-zinc-900 h-2 rounded overflow-hidden border border-zinc-800">
                          <div className="bg-indigo-500 h-full" style={{ width: `${trader.strategyInsights.timingEfficiency}%` }} />
                        </div>
                        <span className="font-mono text-zinc-200 font-bold">
                          {trader.strategyInsights.timingEfficiency}%
                        </span>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Intelligence Verdict */}
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Niche-Trust Engine Verdict</h4>
                  
                  <div className="rounded-xl border border-zinc-900 bg-zinc-950 p-5 space-y-4">
                    <div className="flex items-center gap-3">
                      <span className={`h-3 w-3 rounded-full animate-pulse ${
                        trader.riskLevel === 'LOW' ? 'bg-emerald-500' :
                        trader.riskLevel === 'HIGH' ? 'bg-red-500' : 'bg-amber-500'
                      }`} />
                      <div>
                        <p className="text-xs text-zinc-500 uppercase font-bold tracking-wide">Risk Profile Verdict</p>
                        <p className="text-sm font-bold text-zinc-200 capitalize">{trader.strategyInsights.riskAppetite} ({trader.riskLevel} risk)</p>
                      </div>
                    </div>

                    <div className="space-y-3 text-xs text-zinc-400 leading-relaxed">
                      <p>
                        Our predictive intelligence system analyzed this profile. Here are the core insights:
                      </p>
                      
                      <ul className="space-y-2 list-disc pl-4 text-zinc-350">
                        {trader.winRate >= 65 ? (
                          <li><strong>Elite Accuracy Spotter:</strong> Possesses a statistically exceptional win rate ({trader.winRate.toFixed(0)}%). Shows structural edge rather than speculative chance.</li>
                        ) : (
                          <li><strong>High Volume Exposure:</strong> Relies on broad-market execution with standard pricing spreads. Profits from systemic volume and timing shifts.</li>
                        )}
                        
                        {trader.maxDrawdown < 15 ? (
                          <li><strong>Preservation Bias:</strong> Strong drawdown protection ({trader.maxDrawdown.toFixed(1)}% max drop) indicates aggressive hedging, strict discipline, or early manual exits to protect capital.</li>
                        ) : (
                          <li><strong>Degen Volatility Tolerant:</strong> High capital swings ({trader.maxDrawdown.toFixed(1)}% max drawdown) suggest exposure to highly volatile contracts or willingness to hold losing shares close to maturity.</li>
                        )}

                        {trader.consistency >= 70 ? (
                          <li><strong>Institutional Consistency:</strong> Return consistency ({trader.consistency.toFixed(0)}%) is high, suggesting highly repeatable trading algorithms or systematic rule-based execution.</li>
                        ) : (
                          <li><strong>Lumpy Degen Spikes:</strong> Low return consistency points to profits driven by sporadic blockbuster payouts rather than incremental capital growth.</li>
                        )}

                        {trader.strategyInsights.preferredSide === 'BUY-heavy' ? (
                          <li><strong>Entry Specialist:</strong> Prefers taking early primary positions and holding them to maturity. Minimizes high-frequency exit liquidity friction.</li>
                        ) : (
                          <li><strong>Spread Scalper:</strong> Prefers active exit management, taking short-term spreads or arbitrage exit loops rather than holding to final market resolution.</li>
                        )}
                      </ul>

                      <div className="rounded border border-indigo-950 bg-indigo-950/20 p-3 mt-3 text-[11px] text-indigo-400">
                        <strong>Disclaimer:</strong> This verdict is generated strictly from Polymarket transaction ledgers and score metrics on the block. Past accuracy is not a guarantee of future prediction returns.
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            )}

          </div>

        </div>

      </div>
    </PageShell>
  );
}
