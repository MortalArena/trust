import { ForecastMetrics, AlphaMetrics, ConfidenceMetrics, BehaviorMetrics, RiskMetrics } from './types'

// Weights for PMI composite
const WEIGHTS = {
  predictive: 0.30,
  alpha: 0.25,
  risk: 0.20,
  behavior: 0.15,
  confidence: 0.10,
}

export function calculatePMI(
  forecast: ForecastMetrics,
  alpha: AlphaMetrics,
  confidence: ConfidenceMetrics,
  behavior: BehaviorMetrics,
  risk: RiskMetrics
): number {
  const predictiveScore = forecast.predictiveScore
  const alphaScore = alpha.alphaScore
  const riskScore = risk.riskScore
  const behaviorScore = behavior.behaviorScore
  const confidenceScore = confidence.confidenceScore

  const pmi =
    predictiveScore * WEIGHTS.predictive +
    alphaScore * WEIGHTS.alpha +
    riskScore * WEIGHTS.risk +
    behaviorScore * WEIGHTS.behavior +
    confidenceScore * WEIGHTS.confidence

  return Math.round(Math.max(0, Math.min(100, pmi)) * 10) / 10
}

export const PMI_WEIGHTS = WEIGHTS
