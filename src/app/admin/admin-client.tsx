'use client';

import { useEffect, useState, useCallback } from 'react';

interface AdminStats {
  traderCount: number;
  scored: number;
  synced: number;
  lastSyncAt: string | null;
  categoryCounts: Record<string, number>;
  recentActivity: Array<{
    action: string;
    timestamp: string;
    details?: string;
  }>;
  system: {
    uptime: string;
    dbSize: string;
    traderGrowth: { date: string; count: number }[];
  };
}

export function AdminDashboardClient() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/stats');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setStats(json);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const runAction = async (action: string, endpoint: string, method = 'POST') => {
    setActionLoading(action);
    setActionResult(null);
    try {
      const res = await fetch(endpoint, { method });
      const json = await res.json();
      if (res.ok) {
        setActionResult({ type: 'success', message: `${action}: ${JSON.stringify(json)}` });
        fetchStats();
      } else {
        setActionResult({ type: 'error', message: `${action} failed: ${json.error || res.statusText}` });
      }
    } catch (err) {
      setActionResult({ type: 'error', message: `${action} error: ${(err as Error).message}` });
    } finally {
      setActionLoading(null);
    }
  };

  const runCron = async (task: string) => {
    setActionLoading(`cron-${task}`);
    setActionResult(null);
    try {
      const res = await fetch(`/api/admin/cron?task=${task}`, { method: 'GET' });
      const json = await res.json();
      setActionResult({ type: 'success', message: `Cron ${task}: ${JSON.stringify(json)}` });
      fetchStats();
    } catch (err) {
      setActionResult({ type: 'error', message: `Cron ${task} error: ${(err as Error).message}` });
    } finally {
      setActionLoading(null);
    }
  };

  // ── Loading state ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[var(--accent)] border-t-transparent" />
          <p className="mt-4 text-sm text-[var(--text-secondary)]">Loading admin dashboard…</p>
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <div className="py-16 text-center">
        <p className="text-red-500">{error}</p>
        <button
          type="button"
          onClick={fetchStats}
          className="mt-4 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          System status & manual controls — last updated {new Date().toLocaleTimeString()}
        </p>
      </div>

      {/* Action result toast */}
      {actionResult && (
        <div
          className={`mb-6 rounded-xl border p-4 text-sm ${
            actionResult.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600'
              : 'border-red-500/30 bg-red-500/10 text-red-600'
          }`}
        >
          {actionResult.message}
          <button
            type="button"
            onClick={() => setActionResult(null)}
            className="ml-4 text-xs underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Stats cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total Traders" value={stats?.traderCount ?? 0} />
        <StatCard label="Scored (with trades)" value={stats?.scored ?? 0} />
        <StatCard label="Synced (cached)" value={stats?.synced ?? 0} />
        <StatCard label="Categories" value={Object.keys(stats?.categoryCounts ?? {}).length} />
      </div>

      {/* Action buttons */}
      <div className="mb-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">Manual Actions</h2>
        <div className="flex flex-wrap gap-3">
          <ActionButton
            label="Populate (sync 30)"
            loading={actionLoading === 'populate'}
            onClick={() => runAction('populate', '/api/leaderboard/populate?sync=30')}
          />
          <ActionButton
            label="Full Discover"
            loading={actionLoading === 'discover'}
            onClick={() => runAction('discover', '/api/leaderboard/populate?discoverOnly=1')}
          />
          <ActionButton
            label="Refresh Cron"
            loading={actionLoading === 'cron-refresh'}
            onClick={() => runCron('refresh-leaderboard')}
          />
          <ActionButton
            label="Sync Scores"
            loading={actionLoading === 'sync-scores'}
            onClick={() => runAction('sync', '/api/leaderboard/populate?syncOnly=1&sync=50')}
          />
        </div>
      </div>

      {/* Category distribution */}
      <div className="mb-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">Category Distribution</h2>
        {stats?.categoryCounts && Object.keys(stats.categoryCounts).length > 0 ? (
          <div className="space-y-2">
            {Object.entries(stats.categoryCounts)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 20)
              .map(([cat, count]) => {
                const total = stats.traderCount || 1;
                const pct = ((count / total) * 100).toFixed(1);
                return (
                  <div key={cat} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 text-sm capitalize text-[var(--text-primary)]">
                      {cat.replace(/-/g, ' ')}
                    </span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--bg)]">
                      <div
                        className="h-full rounded-full bg-[var(--accent)] transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-20 text-right text-xs text-[var(--text-secondary)]">
                      {count} ({pct}%)
                    </span>
                  </div>
                );
              })}
          </div>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">No categories found. Run Populate first.</p>
        )}
      </div>

      {/* Trader growth */}
      <div className="mb-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">Trader Growth</h2>
        {stats?.system?.traderGrowth && stats.system.traderGrowth.length > 0 ? (
          <div className="space-y-1.5">
            {stats.system.traderGrowth.slice(-14).map((day) => (
              <div key={day.date} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-xs text-[var(--text-secondary)]">
                  {new Date(day.date).toLocaleDateString()}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--bg)]">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{
                      width: `${(day.count / Math.max(...stats.system.traderGrowth.map((d) => d.count), 1)) * 100}%`,
                    }}
                  />
                </div>
                <span className="w-16 text-right text-xs text-[var(--text-secondary)]">{day.count}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">Growth data not available yet.</p>
        )}
      </div>

      {/* Recent activity */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">Recent Activity</h2>
        {stats?.recentActivity && stats.recentActivity.length > 0 ? (
          <div className="space-y-3">
            {stats.recentActivity.map((act, i) => (
              <div key={i} className="flex items-center gap-3 border-b border-[var(--border)] pb-2 last:border-0">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="flex-1 text-sm text-[var(--text-primary)]">{act.action}</span>
                {act.details && (
                  <span className="hidden text-xs text-[var(--text-secondary)] sm:block">
                    {act.details}
                  </span>
                )}
                <span className="text-xs text-[var(--text-secondary)]">
                  {new Date(act.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">No activity recorded yet.</p>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 text-center">
      <div className="text-2xl font-bold text-[var(--text-primary)]">{value.toLocaleString()}</div>
      <div className="text-xs text-[var(--text-secondary)]">{label}</div>
    </div>
  );
}

function ActionButton({
  label,
  loading,
  onClick,
}: {
  label: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="rounded-lg border border-[var(--border)] bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-wait disabled:opacity-50"
    >
      {loading ? 'Running…' : label}
    </button>
  );
}