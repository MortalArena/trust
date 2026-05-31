import { ReputationTrade, AlphaMetrics } from './types'

export function calculateAlphaMetrics(
  trades: ReputationTrade[],
  marketSnapshots: Map<string, { probability: number; timestamp: number }[]>
): AlphaMetrics {
  if (trades.length < 3) {
    return { alpha24h: 0, alpha7d: 0, sectorAlpha: 0, alphaScore: 0 }
  }

  let alpha24hSum = 0, alpha24hCount = 0
  let alpha7dSum = 0, alpha7dCount = 0
  const sectorAlphaMap: Record<string, { sum: number; count: number }> = {}

  for (const t of trades) {
    const snapshots = marketSnapshots.get(t.marketId)
    if (!snapshots || snapshots.length === 0) continue

    const entryProb = t.entryProbability ?? t.price / 100
    const ts24h = t.timestamp + 24 * 3600 * 1000
    const ts7d = t.timestamp + 7 * 24 * 3600 * 1000

    let snap24h = snapshots.find(s => Math.abs(s.timestamp - ts24h) < 12 * 3600 * 1000)
    let snap7d = snapshots.find(s => Math.abs(s.timestamp - ts7d) < 24 * 3600 * 1000)

    if (!snap24h && snapshots.length > 0) {
      snap24h = snapshots.reduce((closest, s) =>
        Math.abs(s.timestamp - ts24h) < Math.abs(closest.timestamp - ts24h) ? s : closest
      )
      if (Math.abs(snap24h!.timestamp - ts24h) > 12 * 3600 * 1000) snap24h = undefined
    }

    if (snap24h) {
      const futureProb = snap24h.probability / 100
      alpha24hSum += futureProb - entryProb
      alpha24hCount++
    }

    if (snap7d) {
      const futureProb = snap7d.probability / 100
      alpha7dSum += futureProb - entryProb
      alpha7dCount++
    }

    const cat = t.category || 'general'
    if (!sectorAlphaMap[cat]) sectorAlphaMap[cat] = { sum: 0, count: 0 }
    const snap = snapshots[snapshots.length - 1]
    if (snap) {
      sectorAlphaMap[cat].sum += (snap.probability / 100) - entryProb
      sectorAlphaMap[cat].count++
    }
  }

  const alpha24h = alpha24hCount > 0 ? alpha24hSum / alpha24hCount : 0
  const alpha7d = alpha7dCount > 0 ? alpha7dSum / alpha7dCount : 0

  let bestSectorAlpha = 0
  for (const [, data] of Object.entries(sectorAlphaMap)) {
    if (data.count >= 3) {
      const avg = data.sum / data.count
      if (avg > bestSectorAlpha) bestSectorAlpha = avg
    }
  }

  const rawAlpha = alpha24h * 0.6 + alpha7d * 0.4
  const alphaScore = Math.max(0, Math.min(100, 50 + rawAlpha * 400))

  return {
    alpha24h: Math.round(alpha24h * 1000) / 1000,
    alpha7d: Math.round(alpha7d * 1000) / 1000,
    sectorAlpha: Math.round(bestSectorAlpha * 1000) / 1000,
    alphaScore: Math.round(alphaScore * 10) / 10,
  }
}
