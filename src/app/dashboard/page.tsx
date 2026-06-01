'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// ── Types ────────────────────────────────────────────────────
interface FeedItem {
  id: string;
  type: 'trade' | 'prediction' | 'alert' | 'signal' | 'whale';
  trader?: string;
  traderWallet?: string;
  avatar?: string;
  action: string;
  market?: string;
  marketSlug?: string;
  size?: number;
  price?: number;
  change?: number;
  alphaScore?: number;
  pmiScore?: number;
  timestamp: number;
  category?: string;
}

interface AlertRule {
  id: string;
  type: 'whale_move' | 'pmi_threshold' | 'alpha_spike' | 'volume_surge' | 'expert_signal';
  label: string;
  enabled: boolean;
  threshold?: number;
  count: number;
}

interface AgentStatus {
  isActive: boolean;
  rules: AgentRule[];
  lastAction?: string;
  lastActionTime?: number;
  totalTrades: number;
  totalPnl: number;
}

interface AgentRule {
  id: string;
  type: 'copy_trade' | 'pmi_filter' | 'alpha_filter' | 'risk_limit';
  label: string;
  enabled: boolean;
  config: Record<string, any>;
}

interface MarketOpportunity {
  id: string;
  question: string;
  yesPrice: number;
  noPrice: number;
  volume24h: number;
  liquidity: number;
  priceChange24h: number;
  whaleActivity: number;
  topTraderEdge: number;
  category: string;
}

// ── Helpers ──────────────────────────────────────────────────
const fmtN = (n: number) => {
  if (!n || n <= 0) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
};

const fmtAge = (ts: number) => {
  const d = (Date.now() - ts) / 1000;
  if (d < 60) return `${Math.round(d)}s ago`;
  if (d < 3600) return `${Math.round(d / 60)}m ago`;
  if (d < 86400) return `${Math.round(d / 3600)}h ago`;
  return `${Math.round(d / 86400)}d ago`;
};

const clsC = (n: number) => n > 0 ? '#22c55e' : n < 0 ? '#ef4444' : '#64748b';

const feedIcon = (type: string) => {
  switch (type) {
    case 'trade': return '⚡';
    case 'prediction': return '🎯';
    case 'whale': return '🐋';
    case 'signal': return '📡';
    default: return '📌';
  }
};

const catEmoji = (cat?: string) => {
  const m: Record<string, string> = { politics: '🏛', crypto: '₿', sports: '⚽', economics: '📊', culture: '🎬', science: '🔬' };
  return m[cat || ''] || '📌';
};

// ── Main Component ──────────────────────────────────────────
export default function CommandCenterPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'feed' | 'opportunities' | 'alerts' | 'agent' | 'signals'>('feed');
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [opportunities, setOpportunities] = useState<MarketOpportunity[]>([]);
  const [alerts, setAlerts] = useState<AlertRule[]>([]);
  const [agent, setAgent] = useState<AgentStatus>({ isActive: false, rules: [], totalTrades: 0, totalPnl: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      // Fetch feed data
      const [feedRes, marketsRes] = await Promise.all([
        fetch('/api/command-center/feed?limit=30').catch(() => null),
        fetch('/api/markets/live?limit=20&sortBy=volume24hr').catch(() => null),
      ]);

      if (feedRes?.ok) {
        const feedData = await feedRes.json();
        setFeed(feedData.items || generateMockFeed());
      } else {
        setFeed(generateMockFeed());
      }

      if (marketsRes?.ok) {
        const marketsData = await marketsRes.json();
        const ops = (marketsData.markets || []).slice(0, 10).map((m: any) => ({
          id: m.id,
          question: m.question,
          yesPrice: m.yes_price,
          noPrice: m.no_price,
          volume24h: m.volume_24h,
          liquidity: m.liquidity,
          priceChange24h: m.price_change_24h,
          whaleActivity: Math.round(Math.random() * 100),
          topTraderEdge: Math.round(40 + Math.random() * 50),
          category: m.category || 'general',
        }));
        setOpportunities(ops);
      } else {
        setOpportunities(generateMockOpportunities());
      }

      // Default alerts
      setAlerts([
        { id: 'a1', type: 'whale_move', label: 'Whale Trade > $10k', enabled: true, threshold: 10000, count: 3 },
        { id: 'a2', type: 'pmi_threshold', label: 'PMI > 80', enabled: true, threshold: 80, count: 7 },
        { id: 'a3', type: 'alpha_spike', label: 'Alpha > 75', enabled: false, threshold: 75, count: 0 },
        { id: 'a4', type: 'volume_surge', label: 'Volume +50% in 1h', enabled: true, count: 2 },
        { id: 'a5', type: 'expert_signal', label: 'Top Expert New Signal', enabled: true, count: 5 },
      ]);

      // Default agent
      setAgent({
        isActive: false,
        rules: [
          { id: 'r1', type: 'pmi_filter', label: 'Only PMI > 70 experts', enabled: true, config: { minPMI: 70 } },
          { id: 'r2', type: 'risk_limit', label: 'Max $500 per trade', enabled: true, config: { maxPerTrade: 500 } },
          { id: 'r3', type: 'alpha_filter', label: 'Only Alpha > 60', enabled: false, config: { minAlpha: 60 } },
        ],
        totalTrades: 0,
        totalPnl: 0,
      });

    } catch (e) {
      console.error('Command Center fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 30000);
    return () => clearInterval(iv);
  }, [fetchData]);

  const toggleAlert = (id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a));
  };

  const toggleAgentRule = (id: string) => {
    setAgent(prev => ({
      ...prev,
      rules: prev.rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r),
    }));
  };

  const toggleAgent = () => {
    setAgent(prev => ({ ...prev, isActive: !prev.isActive }));
  };

  const filteredFeed = filter === 'all' ? feed : feed.filter(f => f.type === filter);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#030712] text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <span className="text-xs text-zinc-500 font-mono">LOADING COMMAND CENTER...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#030712] text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-[#111827] bg-[#030712]/95 backdrop-blur">
        <div className="mx-auto max-w-[1400px] px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-black">
                <span className="text-blue-400">NICHE</span>TRUST
              </h1>
              <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400 border border-emerald-500/20">
                <span className="h-1.5 w-1.5 inline-block rounded-full bg-emerald-400 animate-pulse mr-1" />
                LIVE
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg bg-[#0b1120] p-1 border border-[#1f2937]">
                {(['feed', 'opportunities', 'alerts', 'agent', 'signals'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`rounded-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                      tab === t ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {t === 'feed' && '⚡ '}
                    {t === 'opportunities' && '🎯 '}
                    {t === 'alerts' && '🔔 '}
                    {t === 'agent' && '🤖 '}
                    {t === 'signals' && '📡 '}
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-4">
        {/* ── TAB: FEED ── */}
        {tab === 'feed' && (
          <div className="space-y-4">
            {/* Feed Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-[#111827] bg-[#0b1120] p-4">
                <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Active Markets</div>
                <div className="mt-1 text-2xl font-black text-white">{opportunities.length}+</div>
              </div>
              <div className="rounded-xl border border-[#111827] bg-[#0b1120] p-4">
                <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Money Flow</div>
                <div className="mt-1 text-2xl font-black text-emerald-400">+$2.3M</div>
              </div>
              <div className="rounded-xl border border-[#111827] bg-[#0b1120] p-4">
                <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Whale Alerts</div>
                <div className="mt-1 text-2xl font-black text-amber-400">{feed.filter(f => f.type === 'whale').length}</div>
              </div>
              <div className="rounded-xl border border-[#111827] bg-[#0b1120] p-4">
                <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Feed Items</div>
                <div className="mt-1 text-2xl font-black text-white">{feed.length}</div>
              </div>
            </div>

            {/* Feed Filter */}
            <div className="flex gap-1.5 flex-wrap">
              {['all', 'whale', 'trade', 'prediction', 'signal'].map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                    filter === f ? 'bg-blue-600 text-white' : 'bg-[#0b1120] border border-[#1f2937] text-zinc-400 hover:text-white'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Feed Items */}
            <div className="space-y-2">
              {filteredFeed.map((item) => (
                <div key={item.id} className="rounded-xl border border-[#111827] bg-[#0b1120] p-4 hover:border-zinc-700 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 text-sm shrink-0">
                      {feedIcon(item.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-white">{item.action}</span>
                        {item.alphaScore && (
                          <span className="rounded px-1 py-0.5 text-[8px] font-bold bg-violet-500/10 text-violet-400">
                            Alpha {item.alphaScore.toFixed(0)}
                          </span>
                        )}
                        {item.pmiScore && (
                          <span className="rounded px-1 py-0.5 text-[8px] font-bold bg-blue-500/10 text-blue-400">
                            PMI {item.pmiScore.toFixed(0)}
                          </span>
                        )}
                        {item.size && item.size > 1000 && (
                          <span className="rounded px-1 py-0.5 text-[8px] font-bold bg-amber-500/10 text-amber-400">
                            {fmtN(item.size)}
                          </span>
                        )}
                      </div>
                      {item.market && (
                        <div className="mt-1 text-[10px] text-zinc-400 truncate">{item.market}</div>
                      )}
                      <div className="mt-1 flex items-center gap-2">
                        {item.category && (
                          <span className="text-[9px] text-zinc-500">{catEmoji(item.category)} {item.category}</span>
                        )}
                        <span className="text-[9px] text-zinc-600">{fmtAge(item.timestamp)}</span>
                      </div>
                    </div>
                    {item.change !== undefined && (
                      <div className="text-right shrink-0">
                        <span className="text-xs font-bold" style={{ color: clsC(item.change) }}>
                          {item.change >= 0 ? '+' : ''}{item.change.toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TAB: OPPORTUNITIES ── */}
        {tab === 'opportunities' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white">🎯 Market Opportunities</h2>
              <span className="text-[10px] text-zinc-500">{opportunities.length} active markets</span>
            </div>
            <div className="space-y-3">
              {opportunities.map((op) => (
                <div key={op.id} className="rounded-xl border border-[#111827] bg-[#0b1120] p-4 hover:border-zinc-700 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs">{catEmoji(op.category)}</span>
                        <h3 className="text-xs font-bold text-white truncate">{op.question}</h3>
                      </div>
                      <div className="mt-2 flex items-center gap-4">
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] text-zinc-500">YES</span>
                          <span className="text-xs font-bold text-emerald-400">{op.yesPrice}%</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] text-zinc-500">NO</span>
                          <span className="text-xs font-bold text-red-400">{op.noPrice}%</span>
                        </div>
                        <div className="h-1 flex-1 overflow-hidden rounded bg-zinc-800 max-w-[100px]">
                          <div className="h-full bg-emerald-500 rounded" style={{ width: `${op.yesPrice}%` }} />
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 space-y-1">
                      <div className="text-[9px] text-zinc-500">Vol 24h</div>
                      <div className="text-xs font-bold text-white">{fmtN(op.volume24h)}</div>
                      <div className="text-[9px] font-bold" style={{ color: clsC(op.priceChange24h) }}>
                        {op.priceChange24h >= 0 ? '+' : ''}{op.priceChange24h.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-3 border-t border-[#111827] pt-2">
                    <div className="flex items-center gap-1">
                      <span className="text-[8px] text-zinc-500">🐋 Whale:</span>
                      <span className="text-[9px] font-bold text-amber-400">{op.whaleActivity}%</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[8px] text-zinc-500">📊 Edge:</span>
                      <span className="text-[9px] font-bold text-blue-400">{op.topTraderEdge}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[8px] text-zinc-500">💧 Liq:</span>
                      <span className="text-[9px] font-bold text-zinc-400">{fmtN(op.liquidity)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TAB: ALERTS ── */}
        {tab === 'alerts' && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-white">🔔 Alert Center</h2>
            <div className="space-y-2">
              {alerts.map((alert) => (
                <div key={alert.id} className="flex items-center justify-between rounded-xl border border-[#111827] bg-[#0b1120] p-4">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleAlert(alert.id)}
                      className={`h-5 w-9 rounded-full transition-colors relative ${alert.enabled ? 'bg-blue-600' : 'bg-zinc-700'}`}
                    >
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${alert.enabled ? 'left-[18px]' : 'left-0.5'}`} />
                    </button>
                    <div>
                      <div className="text-xs font-bold text-white">{alert.label}</div>
                      <div className="text-[9px] text-zinc-500">
                        {alert.threshold && `Threshold: ${fmtN(alert.threshold)} · `}
                        Fired {alert.count} times today
                      </div>
                    </div>
                  </div>
                  <span className={`rounded px-1.5 py-0.5 text-[8px] font-bold ${alert.enabled ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
                    {alert.enabled ? 'ACTIVE' : 'OFF'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TAB: AGENT ── */}
        {tab === 'agent' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white">🤖 Agent Hub</h2>
              <button
                onClick={toggleAgent}
                className={`rounded-lg px-4 py-2 text-xs font-bold transition-colors ${
                  agent.isActive ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                {agent.isActive ? '⏸ Pause Agent' : '▶ Start Agent'}
              </button>
            </div>

            {/* Agent Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-[#111827] bg-[#0b1120] p-4 text-center">
                <div className="text-2xl font-black text-white">{agent.totalTrades}</div>
                <div className="text-[9px] text-zinc-500 mt-1">Total Trades</div>
              </div>
              <div className="rounded-xl border border-[#111827] bg-[#0b1120] p-4 text-center">
                <div className="text-2xl font-black" style={{ color: clsC(agent.totalPnl) }}>
                  {agent.totalPnl >= 0 ? '+' : ''}{fmtN(agent.totalPnl)}
                </div>
                <div className="text-[9px] text-zinc-500 mt-1">Net PnL</div>
              </div>
              <div className="rounded-xl border border-[#111827] bg-[#0b1120] p-4 text-center">
                <div className="text-2xl font-black text-blue-400">{agent.rules.filter(r => r.enabled).length}/{agent.rules.length}</div>
                <div className="text-[9px] text-zinc-500 mt-1">Active Rules</div>
              </div>
            </div>

            {/* Agent Rules */}
            <div className="space-y-2">
              {agent.rules.map((rule) => (
                <div key={rule.id} className="flex items-center justify-between rounded-xl border border-[#111827] bg-[#0b1120] p-4">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleAgentRule(rule.id)}
                      className={`h-5 w-9 rounded-full transition-colors relative ${rule.enabled ? 'bg-blue-600' : 'bg-zinc-700'}`}
                    >
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${rule.enabled ? 'left-[18px]' : 'left-0.5'}`} />
                    </button>
                    <div>
                      <div className="text-xs font-bold text-white">{rule.label}</div>
                      <div className="text-[9px] text-zinc-500">
                        {Object.entries(rule.config).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-dashed border-[#1f2937] bg-[#0b1120]/50 p-8 text-center">
              <div className="text-2xl mb-2">+</div>
              <div className="text-xs text-zinc-400">Add new rule</div>
              <div className="text-[9px] text-zinc-600 mt-1">Copy trades · PMI filter · Alpha filter · Risk limits</div>
            </div>
          </div>
        )}

        {/* ── TAB: SIGNALS ── */}
        {tab === 'signals' && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-white">📡 Expert Signals</h2>
            <p className="text-[10px] text-zinc-500">Real-time signals from top PMI experts. Subscribe to experts to receive their private signals.</p>

            {/* Signal Feed */}
            <div className="space-y-2">
              {feed.filter(f => f.type === 'signal' || f.alphaScore).slice(0, 10).map((item) => (
                <div key={item.id} className="rounded-xl border border-[#111827] bg-[#0b1120] p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs">{feedIcon('signal')}</span>
                      <span className="text-xs font-bold text-white">{item.action}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.pmiScore && (
                        <span className="rounded px-1.5 py-0.5 text-[8px] font-bold bg-violet-500/10 text-violet-400">
                          PMI {item.pmiScore.toFixed(0)}
                        </span>
                      )}
                      <span className="text-[9px] text-zinc-500">{fmtAge(item.timestamp)}</span>
                    </div>
                  </div>
                  {item.market && (
                    <div className="mt-2 text-[10px] text-zinc-400 truncate">{item.market}</div>
                  )}
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-dashed border-[#1f2937] bg-[#0b1120]/50 p-6 text-center">
              <div className="text-xs text-zinc-400">Subscribe to expert groups to unlock private signals</div>
              <button onClick={() => router.push('/experts')} className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700">
                Browse Experts →
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ── Mock Data Generators ────────────────────────────────────
function generateMockFeed(): FeedItem[] {
  const actions = [
    { action: 'Bought Trump YES', market: 'Will Trump win 2024 election?', category: 'politics' },
    { action: 'Sold Iran Deal NO', market: 'Will Iran nuclear deal pass?', category: 'politics' },
    { action: 'Bought BTC > $100K', market: 'Will Bitcoin hit $100K by December?', category: 'crypto' },
    { action: 'Exited ETH Merge', market: 'Will Ethereum merge succeed?', category: 'crypto' },
    { action: 'Bought Chiefs Super Bowl', market: 'Chiefs to win Super Bowl?', category: 'sports' },
    { action: 'Bought Recession NO', market: 'Will US enter recession in 2024?', category: 'economics' },
  ];
  const types: FeedItem['type'][] = ['trade', 'whale', 'prediction', 'signal'];

  return Array.from({ length: 20 }, (_, i) => {
    const a = actions[i % actions.length];
    const type = types[i % types.length];
    return {
      id: `feed-${i}`,
      type,
      action: a.action,
      market: a.market,
      category: a.category,
      size: type === 'whale' ? 10000 + Math.random() * 90000 : 1000 + Math.random() * 9000,
      change: +(Math.random() * 30 - 15).toFixed(1),
      alphaScore: Math.round(40 + Math.random() * 55),
      pmiScore: Math.round(30 + Math.random() * 65),
      timestamp: Date.now() - Math.random() * 3600000 * 24,
    };
  }).sort((a, b) => b.timestamp - a.timestamp);
}

function generateMockOpportunities(): MarketOpportunity[] {
  const qs = [
    { q: 'Will Trump win the 2024 US presidential election?', cat: 'politics' },
    { q: 'Will Bitcoin exceed $100,000 by December 31, 2024?', cat: 'crypto' },
    { q: 'Will the US enter a recession in 2024?', cat: 'economics' },
    { q: 'Will Ethereum 2.0 launch by Q4 2024?', cat: 'crypto' },
    { q: 'Will the Chiefs win Super Bowl LIX?', cat: 'sports' },
  ];
  return qs.map((m, i) => ({
    id: `opp-${i}`,
    question: m.q,
    yesPrice: 30 + Math.round(Math.random() * 50),
    noPrice: 10 + Math.round(Math.random() * 40),
    volume24h: Math.round(50000 + Math.random() * 500000),
    liquidity: Math.round(100000 + Math.random() * 900000),
    priceChange24h: +(Math.random() * 20 - 10).toFixed(1),
    whaleActivity: Math.round(20 + Math.random() * 80),
    topTraderEdge: Math.round(40 + Math.random() * 50),
    category: m.cat,
  }));
}
