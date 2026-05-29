'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback, useRef } from 'react';
import { MARKET_CATEGORIES } from '@/lib/markets/categories';

interface LeaderboardEntry {
  rank: number;
  trader: {
    proxyWallet: string;
    displayName: string | null;
    pseudonym: string | null;
    verifiedBadge: boolean;
    xUsername: string | null;
    trustScore: number;
    edgeScore: number;
    winRate: number;
    roi: number;
    maxDrawdown: number;
    consistency: number;
    profitFactor: number;
    riskLevel: string;
    totalTrades: number;
    activityDays: number;
    avgTradeSize: number;
    totalVolumeUsd: number;
    timingScore: number;
    categories: string[];
    polymarketUrl: string | undefined;
  };
}

interface LeaderboardPage {
  entries: LeaderboardEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  categories: string[];
}

const SUBCATEGORIES: Record<string, string[]> = {
  sports: ['sports', 'nfl', 'nba', 'soccer', 'mlb', 'nhl', 'ufc', 'mma', 'boxing', 'tennis', 'golf', 'cricket'],
  politics: ['politics', 'us-elections', 'global-elections', 'policy', 'us-politics'],
  crypto: ['crypto', 'bitcoin', 'ethereum', 'defi', 'nft', 'solana'],
  economics: ['economics', 'macro', 'fed', 'equities', 'finance'],
  culture: ['culture', 'entertainment', 'awards', 'box-office', 'music'],
};

const SUBCATEGORY_LABELS: Record<string, string> = {
  sports: 'All Sports',
  nfl: 'NFL',
  nba: 'NBA',
  soccer: 'Soccer',
  politics: 'All Politics',
  'us-elections': 'US Elections',
  crypto: 'All Crypto',
  bitcoin: 'Bitcoin',
  ethereum: 'Ethereum',
  economics: 'All Economics',
  macro: 'Macro',
  culture: 'All Culture',
};

function edgeColor(score: number): string {
  if (score >= 75) return 'text-emerald-500';
  if (score >= 50) return 'text-amber-500';
  return 'text-[var(--text-secondary)]';
}

const SORT_OPTIONS = [
  { value: 'edgeScore', label: 'Edge Score' },
  { value: 'trustScore', label: 'Trust Score' },
  { value: 'roi', label: 'ROI' },
  { value: 'winRate', label: 'Win Rate' },
  { value: 'consistency', label: 'Consistency' },
  { value: 'totalVolumeUsd', label: 'Volume' },
  { value: 'totalTrades', label: 'Trades' },
];

export function LeaderboardClient() {
  const [data, setData] = useState<LeaderboardPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSubcategory, setSelectedSubcategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('edgeScore');
  const [page, setPage] = useState(1);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: '50',
        page: String(page),
        sortBy,
      });

      // Multi-category filter
      if (selectedCategories.length > 0) {
        selectedCategories.forEach((cat) => params.append('categories', cat));
      }

      // Subcategory filter
      if (selectedSubcategory) {
        const parent = Object.entries(SUBCATEGORIES).find(([, subs]) =>
          subs.includes(selectedSubcategory)
        )?.[0];
        if (parent && !selectedCategories.includes(parent)) {
          params.append('categories', parent);
        }
        params.append('categories', selectedSubcategory);
      }

      // Search
      if (searchQuery.trim()) {
        params.set('search', searchQuery.trim());
      }

      const res = await fetch(`/api/leaderboard/traders?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: LeaderboardPage = await res.json();
      setData(json);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [selectedCategories, selectedSubcategory, searchQuery, sortBy, page]);

  // Debounced fetch for search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(fetchLeaderboard, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [selectedCategories, selectedSubcategory, sortBy, page, fetchLeaderboard]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchLeaderboard, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLeaderboard]);

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
    setSelectedSubcategory('');
    setPage(1);
  };

  const toggleSubcategory = (sub: string) => {
    setSelectedSubcategory((prev) => (prev === sub ? '' : sub));
    setPage(1);
  };

  return (
    <div>
      <div className="mb-8 rounded-2xl border border-[var(--border)] bg-gradient-to-br from-[var(--surface)] to-[var(--bg)] p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
          Intelligence Engine
        </p>
        <h1 className="mt-2 text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
          Polymarket wallet rankings
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-secondary)]">
          Bloomberg-style reputation for prediction traders. Edge Score blends ROI, consistency,
          risk control, timing, and volume — precomputed from Polymarket trades and closed positions.
        </p>
        {data && (
          <p className="mt-3 text-xs text-[var(--text-secondary)]">
            {data.total} wallets tracked · Page {data.page}/{data.totalPages}
          </p>
        )}
      </div>

      {/* Filters row */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Category pills */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setSelectedCategories([]);
              setSelectedSubcategory('');
              setPage(1);
            }}
            className={`rounded-full px-3 py-1.5 text-sm ${
              selectedCategories.length === 0
                ? 'bg-[var(--accent)] text-white'
                : 'border border-[var(--border)] text-[var(--text-secondary)]'
            }`}
          >
            All markets
          </button>
          {MARKET_CATEGORIES.filter((c) => c.slug in SUBCATEGORIES).map((cat) => (
            <button
              key={cat.slug}
              type="button"
              onClick={() => toggleCategory(cat.slug)}
              className={`rounded-full px-3 py-1.5 text-sm ${
                selectedCategories.includes(cat.slug)
                  ? 'bg-[var(--accent)] text-white'
                  : 'border border-[var(--border)] text-[var(--text-secondary)]'
              }`}
            >
              {cat.icon} {cat.name}
            </button>
          ))}
        </div>

        {/* Sort dropdown */}
        <select
          value={sortBy}
          onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Search */}
        <input
          type="search"
          placeholder="Search wallet or name…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="min-w-[180px] flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
        />

        {/* Auto-refresh toggle */}
        <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="rounded"
          />
          Auto-refresh
        </label>
      </div>

      {/* Subcategories */}
      {selectedCategories.length === 1 && SUBCATEGORIES[selectedCategories[0]] && (
        <div className="mb-4 flex flex-wrap gap-2">
          {SUBCATEGORIES[selectedCategories[0]].map((subSlug) => (
            <button
              key={subSlug}
              type="button"
              onClick={() => toggleSubcategory(subSlug)}
              className={`rounded-full px-2.5 py-1 text-xs ${
                selectedSubcategory === subSlug
                  ? 'bg-[var(--accent)] text-white'
                  : 'border border-[var(--border)] text-[var(--text-secondary)]'
              }`}
            >
              {SUBCATEGORY_LABELS[subSlug] ?? subSlug}
            </button>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="py-16 text-center text-[var(--text-secondary)]">Loading rankings…</div>
      )}

      {/* Error */}
      {error && (
        <div className="py-16 text-center">
          <p className="text-red-500">{error}</p>
          <button
            type="button"
            onClick={fetchLeaderboard}
            className="mt-4 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm text-white"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && data && data.entries.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--border)] py-16 text-center">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Building trader index…</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[var(--text-secondary)]">
            No traders found. Populate the database via the Admin panel or run the bootstrap API.
          </p>
        </div>
      )}

      {/* Results */}
      {!loading && data && data.entries.length > 0 && (
        <>
          <div className="space-y-2">
            {data.entries.map((entry) => {
              const t = entry.trader;
              const riskClass =
                t.riskLevel === 'LOW'
                  ? 'bg-emerald-500/10 text-emerald-600'
                  : t.riskLevel === 'HIGH'
                    ? 'bg-red-500/10 text-red-600'
                    : 'bg-amber-500/10 text-amber-600';

              return (
                <Link
                  key={t.proxyWallet}
                  href={`/trader/${t.proxyWallet}`}
                  className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition hover:border-[var(--accent)] sm:flex-row sm:items-center"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-lg font-bold text-white">
                    {entry.rank}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[var(--text-primary)]">
                        {t.displayName || t.pseudonym || 'Anonymous'}
                      </span>
                      {t.verifiedBadge && <span title="Verified">✓</span>}
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-[var(--text-secondary)]">
                      {t.proxyWallet.slice(0, 8)}…{t.proxyWallet.slice(-6)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${riskClass}`}>
                        {t.riskLevel} risk
                      </span>
                      {t.categories.slice(0, 3).map((cat) => (
                        <span
                          key={cat}
                          className="rounded-full bg-[var(--bg)] px-2 py-0.5 text-xs text-[var(--text-secondary)]"
                        >
                          {cat}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-5 sm:gap-6">
                    <div className="text-center">
                      <div className={`text-xl font-bold ${edgeColor(t.edgeScore)}`}>
                        {t.edgeScore.toFixed(1)}
                      </div>
                      <div className="text-xs text-[var(--text-secondary)]">Edge</div>
                    </div>
                    <div className="text-center">
                      <div
                        className={`text-lg font-semibold ${t.roi >= 0 ? 'text-emerald-500' : 'text-red-500'}`}
                      >
                        {t.roi >= 0 ? '+' : ''}
                        {t.roi.toFixed(1)}%
                      </div>
                      <div className="text-xs text-[var(--text-secondary)]">ROI</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-semibold text-[var(--text-primary)]">
                        {t.winRate.toFixed(0)}%
                      </div>
                      <div className="text-xs text-[var(--text-secondary)]">Win</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-semibold text-[var(--text-primary)]">
                        ${(t.totalVolumeUsd / 1000).toFixed(0)}k
                      </div>
                      <div className="text-xs text-[var(--text-secondary)]">Volume</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-semibold text-[var(--text-primary)]">
                        {t.totalTrades}
                      </div>
                      <div className="text-xs text-[var(--text-secondary)]">Trades</div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="mt-6 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--text-primary)] disabled:opacity-40"
            >
              ← Previous
            </button>
            <span className="text-sm text-[var(--text-secondary)]">
              Page {data.page} of {data.totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={page >= data.totalPages}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--text-primary)] disabled:opacity-40"
            >
              Next →
            </button>
          </div>

          <p className="mt-8 text-center text-xs text-[var(--text-secondary)]">
            Edge Score = 40% ROI + 25% consistency + 15% risk + 10% timing + 10% volume.{' '}
            <Link href="/learn/intelligence-engine" className="text-[var(--accent)] hover:underline">
              How it works
            </Link>
          </p>
        </>
      )}
    </div>
  );
}