/**
 * Composite Edge Score — reputation formula for prediction traders.
 *
 * Measures true predictive edge by combining:
 * 30% — ROI (risk-adjusted return)
 * 25% — Consistency (month-over-month stability)
 * 15% — Win Rate (prediction accuracy)
 * 15% — Timing Score (temporal distribution of trades)
 * 10% — Activity Volume (trades per month)
 *  5% — Profit Factor (reward/risk ratio)
 */

export interface EdgeScoreInput {
  roi: number;
  consistency: number;
  maxDrawdown: number;
  timingScore: number;
  tradesPerMonth: number;
  winRate: number;
  profitFactor: number;
}

function norm(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}

export function calculateEdgeScore(input: EdgeScoreInput): number {
  const roiNorm = norm(input.roi, -30, 150);
  const consistencyNorm = Math.min(100, Math.max(0, input.consistency));
  const winRateNorm = Math.min(100, Math.max(0, input.winRate));
  const riskNorm = 100 - norm(input.maxDrawdown, 0, 80);
  const timingNorm = Math.min(100, Math.max(0, input.timingScore));
  const volumeNorm = norm(input.tradesPerMonth, 0, 80);
  const pfNorm = norm(input.profitFactor, 0, 5);

  const edge =
    roiNorm * 0.30 +
    consistencyNorm * 0.25 +
    winRateNorm * 0.15 +
    riskNorm * 0.15 +
    timingNorm * 0.10 +
    pfNorm * 0.05;

  // Activity bonus: scale up slightly for higher volume traders
  const volumeBonus = volumeNorm * 0.10;

  return Math.round(Math.min(100, (edge + volumeBonus)) * 100) / 100;
}

export const RANKING_BOARDS = [
  'top_edge',
  'highest_roi_30d',
  'best_win_rate',
  'most_consistent',
  'smart_money_volume',
  'top_trust',
  'best_profit_factor',
  'lowest_risk',
] as const;

export type RankingBoardId = (typeof RANKING_BOARDS)[number];

export const RANKING_BOARD_LABELS: Record<RankingBoardId, { label: string; description: string }> = {
  top_edge: {
    label: 'Edge Score',
    description: 'Composite reputation: ROI, consistency, win rate, risk, timing',
  },
  highest_roi_30d: {
    label: 'Highest ROI',
    description: 'Best return on resolved positions',
  },
  best_win_rate: {
    label: 'Win Rate',
    description: 'Highest win % (min. 10 trades)',
  },
  most_consistent: {
    label: 'Most Consistent',
    description: 'Stable month-over-month performance',
  },
  smart_money_volume: {
    label: 'Smart Money',
    description: 'Highest notional volume traded',
  },
  top_trust: {
    label: 'Trust Score',
    description: 'Reliability: accuracy, stability, profit factor, drawdown protection',
  },
  best_profit_factor: {
    label: 'Profit Factor',
    description: 'Best gross profit to gross loss ratio',
  },
  lowest_risk: {
    label: 'Lowest Risk',
    description: 'Best drawdown control with positive returns',
  },
};
