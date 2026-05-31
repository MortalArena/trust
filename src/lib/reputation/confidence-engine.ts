import { ReputationTrade, ConfidenceMetrics } from './types'

export function calculateConfidenceMetrics(
  trades: ReputationTrade[],
  totalActiveDays: number
): ConfidenceMetrics {
  const n = trades.length
  const confidenceMultiplier = 1 - Math.exp(-n / 150)
  const confidenceScore = Math.round(confidenceMultiplier * 100 * 10) / 10
  const avgTradesPerDay = totalActiveDays > 0 ? Math.round((n / totalActiveDays) * 10) / 10 : 0

  let activeWeeks = 0
  if (n >= 2) {
    const timestamps = trades.map(t => t.timestamp).sort((a, b) => a - b)
    const daysSpan = (timestamps[timestamps.length - 1] - timestamps[0]) / (24 * 3600 * 1000)
    activeWeeks = Math.max(1, Math.round(daysSpan / 7))
  }

  return {
    sampleSize: n,
    tradesCount: n,
    avgTradesPerDay,
    activeWeeks,
    confidenceMultiplier: Math.round(confidenceMultiplier * 1000) / 1000,
    confidenceScore,
  }
}
