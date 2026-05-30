import { calculateROI } from './roi';
import { calculateWinRate } from './winrate';
import { calculateMaxDrawdown } from './drawdown';
import { calculateConsistency } from './consistency';
import type { TraderMetrics, TrustScoreResult } from './types';

function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Production Trust Score Engine
 *
 * Multi-factor composite score (0-100) for prediction trader reliability:
 *
 * 25% — Risk-Adjusted Return (ROI normalized vs drawdown)
 * 20% — Win Rate (accuracy of predictions)
 * 20% — Consistency (month-over-month stability)
 * 15% — Profit Factor (gross profit / gross loss ratio)
 * 10% — Activity Score (trades per month — volume of evidence)
 * 10% — Sample Size Confidence (more trades = more trustworthy score)
 *
 * Penalties:
 * - High drawdown (>50%) → trust score capped to 40
 * - Very few trades (<5) → heavy uncertainty discount
 * - Negative profit factor (<0.5) → cap at 30
 */
export function calculateTrustScore(metrics: TraderMetrics): TrustScoreResult {
  const roi = calculateROI(metrics.trades);
  const winRate = calculateWinRate(metrics.trades);
  const maxDrawdown = calculateMaxDrawdown(metrics.equityCurve);
  const consistency = calculateConsistency(metrics.monthlyReturns);

  // ── Profit Factor ──
  const grossProfit = metrics.trades
    .filter((t) => t.pnl > 0)
    .reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(
    metrics.trades.filter((t) => t.pnl < 0).reduce((s, t) => s + t.pnl, 0)
  );
  let profitFactor: number;
  if (grossLoss === 0) {
    profitFactor = grossProfit > 0 ? 10 : 0;
  } else {
    profitFactor = grossProfit / grossLoss;
  }

  // ── Normalized components ──
  // ROI: range -50% to +200%
  const roiNorm = normalize(roi, -50, 200);

  // Win Rate: already 0-100
  const winRateNorm = clamp(winRate, 0, 100);

  // Consistency: already 0-100 from calculateConsistency
  const consistencyNorm = clamp(consistency, 0, 100);

  // Drawdown protection: inverted (lower drawdown = higher score), range 0-100%
  const drawdownNorm = 100 - normalize(maxDrawdown, 0, 100);

  // Profit Factor: range 0 to 5 (above 5 = capped at 100)
  const pfNorm = normalize(profitFactor, 0, 5);

  // Activity: trades per month, range 0-100
  const tradesPerMonth = metrics.tradeCount / Math.max(1, metrics.activityDays / 30);
  const activityNorm = normalize(tradesPerMonth, 0, 100);

  // Sample size confidence: sigmoid curve — 0 trades = 0%, 5+ trades = 50%, 50+ = 90%, 200+ = 100%
  const sampleConfidence = metrics.tradeCount >= 200
    ? 100
    : metrics.tradeCount >= 50
      ? 90
      : metrics.tradeCount >= 20
        ? 70
        : metrics.tradeCount >= 10
          ? 55
          : metrics.tradeCount >= 5
            ? 40
            : 15;

  // ── Weighted composite score ──
  const rawScore =
    roiNorm * 0.20 +
    winRateNorm * 0.20 +
    consistencyNorm * 0.20 +
    pfNorm * 0.15 +
    drawdownNorm * 0.15 +
    activityNorm * 0.05 +
    sampleConfidence * 0.05;

  let trustScore = clamp(rawScore, 0, 100);

  // ── Penalties ──
  // Extreme drawdown cap
  if (maxDrawdown > 50) {
    trustScore = Math.min(trustScore, 40);
  }
  // Bad profit factor cap
  if (profitFactor < 0.5) {
    trustScore = Math.min(trustScore, 30);
  }
  // Very low activity uncertainty discount
  if (metrics.tradeCount < 5) {
    trustScore *= 0.5;
  }

  // ── Risk Level ──
  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';
  if (maxDrawdown < 15 && consistency > 70 && profitFactor > 1.5) {
    riskLevel = 'LOW';
  } else if (maxDrawdown > 40 || consistency < 35 || profitFactor < 0.8) {
    riskLevel = 'HIGH';
  }

  return {
    trustScore: Math.round(trustScore * 100) / 100,
    roi: Math.round(roi * 100) / 100,
    winRate: Math.round(winRate * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    consistency: Math.round(consistency * 100) / 100,
    profitFactor: Math.round(profitFactor * 100) / 100,
    riskLevel,
  };
}
