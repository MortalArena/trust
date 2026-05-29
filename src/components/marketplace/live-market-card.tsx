'use client';

import { formatVolumeDisplay } from '@/lib/polymarket/parse-market';
import type { ParsedMarketCard } from '@/lib/polymarket/parse-market';

interface LiveMarketCardProps {
  market: ParsedMarketCard & {
    liquidity?: number;
    priceChange24h?: number;
    activityLevel?: 'HOT' | 'WARM' | 'COLD';
    whaleActivity?: boolean;
    momentum?: 'Bullish' | 'Bearish' | 'Neutral';
    lastLargeTrade?: { side: string; amount: number };
  };
}

function getActivityColor(level?: string) {
  if (level === 'HOT') return 'bg-red-500 text-white';
  if (level === 'WARM') return 'bg-amber-500 text-white';
  return 'bg-slate-600 text-slate-300';
}

function getChangeColor(change?: number) {
  if (change && change > 0) return 'text-emerald-400';
  if (change && change < 0) return 'text-red-400';
  return 'text-slate-400';
}

export function LiveMarketCard({ market }: LiveMarketCardProps) {
  const yesProb = market.outcomes[0]?.probability ?? 50;
  const noProb = market.outcomes[1]?.probability ?? 50;
  const vol = market.volume24hrUsd ?? market.volumeUsd ?? 0;
  const change = market.priceChange24h ?? 0;

  return (
    <a
      href={market.href}
      target="_blank"
      rel="noreferrer"
      className="group block rounded-xl border border-slate-700 bg-slate-900 p-4 transition hover:border-blue-500"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 text-sm font-medium text-white">
          {market.question}
        </h3>
        <span
          className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${getActivityColor(market.activityLevel)}`}
        >
          {market.activityLevel}
        </span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="rounded bg-slate-800 p-2">
          <p className="text-[10px] text-slate-400">YES</p>
          <p className="text-lg font-bold text-emerald-400">{yesProb}%</p>
        </div>
        <div className="rounded bg-slate-800 p-2">
          <p className="text-[10px] text-slate-400">NO</p>
          <p className="text-lg font-bold text-red-400">{noProb}%</p>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">
          24h: {formatVolumeDisplay(vol)}
        </span>
        {market.liquidity && (
          <span className="text-slate-400">
            Liquidity: {formatVolumeDisplay(market.liquidity)}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between text-xs">
        <span className={getChangeColor(change)}>
          {change ? `${change > 0 ? '+' : ''}${change}%` : '—'} 24h
        </span>
        <span className="text-slate-400">{market.momentum}</span>
        {market.whaleActivity && (
          <span className="text-amber-400" title="Whale activity detected">
            🐋
          </span>
        )}
      </div>

      {market.lastLargeTrade && (
        <div className="mt-2 border-t border-slate-700 pt-2 text-[10px] text-slate-400">
          Last: {market.lastLargeTrade.side} ${formatVolumeDisplay(market.lastLargeTrade.amount)}
        </div>
      )}

      {market.categoryLabel && (
        <div className="mt-2">
          <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">
            {market.categoryLabel}
          </span>
        </div>
      )}
    </a>
  );
}