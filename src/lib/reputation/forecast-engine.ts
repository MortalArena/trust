import { ReputationTrade, ForecastMetrics } from './types'

export function calculateForecastMetrics(
  trades: ReputationTrade[],
  marketSnapshots: Map<string, { probability: number; timestamp: number }[]>
): ForecastMetrics {
  if (trades.length < 3) {
    return { brierScore: 0.25, logLoss: 0.693, calibrationScore: 50, predictiveScore: 0 }
  }

  const resolvedTrades = trades.filter(t => t.resolvedOutcome !== undefined)
  let brierSum = 0
  let brierCount = 0

  for (const t of resolvedTrades) {
    const p = t.entryProbability ?? t.price / 100
    const o = t.resolvedOutcome!
    brierSum += (p - o) ** 2
    brierCount++
  }

  for (const t of trades.filter(t => t.resolvedOutcome === undefined)) {
    const p = t.entryProbability ?? t.price / 100
    const snapshots = marketSnapshots.get(t.marketId)
    if (snapshots && snapshots.length > 0) {
      const latest = snapshots[snapshots.length - 1]
      const currentProb = latest.probability / 100
      brierSum += (p - currentProb) ** 2 * 0.5
      brierCount += 0.5
    }
  }

  const brierScore = brierCount > 0 ? brierSum / brierCount : 0.25
  const EPSILON = 0.001
  let logLossSum = 0
  let logLossCount = 0

  for (const t of resolvedTrades) {
    const p = Math.max(EPSILON, Math.min(1 - EPSILON, t.entryProbability ?? t.price / 100))
    const o = t.resolvedOutcome!
    logLossSum += -(o * Math.log(p) + (1 - o) * Math.log(1 - p))
    logLossCount++
  }

  const logLoss = logLossCount > 0 ? logLossSum / logLossCount : 0.693

  const buckets: { predicted: number[]; actual: number[] }[] = []
  for (let i = 0; i < 10; i++) buckets.push({ predicted: [], actual: [] })

  for (const t of resolvedTrades) {
    const p = t.entryProbability ?? t.price / 100
    const bucketIdx = Math.min(9, Math.floor(p * 10))
    buckets[bucketIdx].predicted.push(p)
    buckets[bucketIdx].actual.push(t.resolvedOutcome!)
  }

  let calibrationError = 0
  let calibratedBuckets = 0

  for (const bucket of buckets) {
    if (bucket.predicted.length < 2) continue
    const avgPredicted = bucket.predicted.reduce((a, b) => a + b, 0) / bucket.predicted.length
    const avgActual = bucket.actual.reduce((a, b) => a + b, 0) / bucket.actual.length
    calibrationError += Math.abs(avgPredicted - avgActual)
    calibratedBuckets++
  }

  const calibrationScore = calibratedBuckets > 0
    ? Math.max(0, 100 - (calibrationError / calibratedBuckets) * 200)
    : 50

  const brierScoreNorm = Math.max(0, (0.25 - brierScore) / 0.25) * 100
  const logLossNorm = Math.max(0, (0.693 - logLoss) / 0.693) * 100
  const predictiveScore = brierScoreNorm * 0.4 + logLossNorm * 0.3 + calibrationScore * 0.3

  return {
    brierScore: Math.round(brierScore * 1000) / 1000,
    logLoss: Math.round(logLoss * 1000) / 1000,
    calibrationScore: Math.round(calibrationScore * 10) / 10,
    predictiveScore: Math.round(predictiveScore * 10) / 10,
  }
}
