import { ReputationTrade, ReputationPosition, ReputationOutput } from './types'
import { calculateForecastMetrics } from './forecast-engine'
import { calculateAlphaMetrics } from './alpha-engine'
import { calculateConfidenceMetrics } from './confidence-engine'
import { calculateBehaviorMetrics } from './behavior-engine'
import { calculateRiskMetrics } from './risk-engine'
import { calculatePMI } from './pmi-engine'

export function calculateReputation(
  trades: ReputationTrade[],
  positions: ReputationPosition[],
  marketSnapshots: Map<string, { probability: number; timestamp: number }[]>,
  totalActiveDays: number
): ReputationOutput {
  const forecast = calculateForecastMetrics(trades, marketSnapshots)
  const alpha = calculateAlphaMetrics(trades, marketSnapshots)
  const confidence = calculateConfidenceMetrics(trades, totalActiveDays)
  const behavior = calculateBehaviorMetrics(trades)
  const risk = calculateRiskMetrics(trades, positions)
  const masterPMI = calculatePMI(forecast, alpha, confidence, behavior, risk)

  return {
    predictiveScore: forecast.predictiveScore,
    alphaScore: alpha.alphaScore,
    confidenceScore: confidence.confidenceScore,
    behaviorScore: behavior.behaviorScore,
    riskScore: risk.riskScore,
    masterPMI,
    forecastMetrics: forecast,
    alphaMetrics: alpha,
    confidenceMetrics: confidence,
    behaviorMetrics: behavior,
    riskMetrics: risk,
  }
}

export { calculateForecastMetrics } from './forecast-engine'
export { calculateAlphaMetrics } from './alpha-engine'
export { calculateConfidenceMetrics } from './confidence-engine'
export { calculateBehaviorMetrics } from './behavior-engine'
export { calculateRiskMetrics } from './risk-engine'
export { calculatePMI } from './pmi-engine'
export * from './types'
