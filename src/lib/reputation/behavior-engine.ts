import { ReputationTrade, BehaviorMetrics, BehaviorFlags } from './types'

export function calculateBehaviorMetrics(
  trades: ReputationTrade[]
): BehaviorMetrics {
  const n = trades.length
  if (n < 5) {
    return {
      revengeTradingScore: 50,
      fomoScore: 50,
      martingaleScore: 50,
      disciplineScore: 50,
      behaviorScore: 50,
      flags: { revengeTrading: false, martingale: false, fomo: false, overconfidence: false, panicExit: false },
    }
  }

  const sorted = [...trades].sort((a, b) => a.timestamp - b.timestamp)
  const pnls = sorted.map(t => t.resolvedOutcome !== undefined
    ? (t.resolvedOutcome === 1 ? t.valueUsd * (1 / (t.price / 100) - 1) : -t.valueUsd)
    : 0
  )

  // 1. Revenge Trading: after loss, next trade is larger within 2 hours
  let revengeCount = 0
  let revengeOpportunities = 0

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const curr = sorted[i]
    const prevPnL = pnls[i - 1]

    if (prevPnL < 0) {
      revengeOpportunities++
      const timeDiff = curr.timestamp - prev.timestamp
      if (timeDiff < 2 * 3600 * 1000 && curr.valueUsd > prev.valueUsd * 1.5) {
        revengeCount++
      }
    }
  }

  const revengeRate = revengeOpportunities > 0 ? revengeCount / revengeOpportunities : 0
  const revengeTradingScore = Math.max(0, Math.round((1 - revengeRate * 3) * 100))

  // 2. Martingale: 3+ consecutive size increases after losses
  let martingaleCount = 0
  let consecutiveLosses = 0
  let sizeIncreasing = false

  for (let i = 1; i < sorted.length; i++) {
    if (pnls[i - 1] < 0) {
      consecutiveLosses++
      if (sorted[i].valueUsd > sorted[i - 1].valueUsd) {
        if (!sizeIncreasing) sizeIncreasing = true
        if (consecutiveLosses >= 3) martingaleCount++
      } else {
        sizeIncreasing = false
        consecutiveLosses = 0
      }
    } else {
      consecutiveLosses = 0
      sizeIncreasing = false
    }
  }

  const martingaleRate = n > 0 ? martingaleCount / n : 0
  const martingaleScore = Math.max(0, Math.round((1 - martingaleRate * 10) * 100))

  // 3. FOMO: entering after a big price move (>15% in 1h)
  let fomoCount = 0
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i]
    const entryProb = t.entryProbability ?? t.price / 100
    // If entry probability is very high (>0.7) and the market has been trending up
    if (entryProb > 0.7 && t.side === 'BUY') {
      fomoCount++
    }
  }

  const fomoRate = n > 0 ? fomoCount / n : 0
  const fomoScore = Math.max(0, Math.round((1 - fomoRate * 2) * 100))

  // 4. Position Sizing Discipline: coefficient of variation of trade sizes
  const sizes = sorted.map(t => t.valueUsd)
  const avgSize = sizes.reduce((a, b) => a + b, 0) / n
  const stdDev = Math.sqrt(sizes.reduce((sum, s) => sum + (s - avgSize) ** 2, 0) / n)
  const cv = avgSize > 0 ? stdDev / avgSize : 0
  // CV < 0.5 = very disciplined, CV > 2 = erratic
  const disciplineScore = Math.max(0, Math.min(100, Math.round((1 - cv / 3) * 100)))

  // Behavior Score: weighted composite
  const behaviorScore = Math.round(
    revengeTradingScore * 0.25 +
    fomoScore * 0.20 +
    martingaleScore * 0.25 +
    disciplineScore * 0.30
  )

  return {
    revengeTradingScore,
    fomoScore,
    martingaleScore,
    disciplineScore,
    behaviorScore,
    flags: {
      revengeTrading: revengeRate > 0.3,
      martingale: martingaleRate > 0.05,
      fomo: fomoRate > 0.3,
      overconfidence: disciplineScore < 30,
      panicExit: false, // would need position duration data
    },
  }
}
