import { ReputationTrade, ReputationPosition, RiskMetrics } from './types'

export function calculateRiskMetrics(
  trades: ReputationTrade[],
  positions: ReputationPosition[]
): RiskMetrics {
  const n = trades.length
  if (n < 5) {
    return {
      maxDrawdown: 0,
      volatility: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      calmarRatio: 0,
      exposureConcentration: 0,
      sectorConcentration: 0,
      riskScore: 50,
    }
  }

  const sorted = [...trades].sort((a, b) => a.timestamp - b.timestamp)
  const pnls = sorted.map(t =>
    t.resolvedOutcome !== undefined
      ? (t.resolvedOutcome === 1 ? t.valueUsd * (1 / Math.max(0.01, t.price / 100) - 1) : -t.valueUsd)
      : 0
  )

  // 1. Max Drawdown
  let peak = 0
  let maxDD = 0
  let cumulative = 0
  for (const pnl of pnls) {
    cumulative += pnl
    if (cumulative > peak) peak = cumulative
    const dd = peak > 0 ? (peak - cumulative) / peak : 0
    if (dd > maxDD) maxDD = dd
  }

  // 2. Volatility (std dev of daily returns)
  const dailyReturns: number[] = []
  let dayPnL = 0
  let dayStart = sorted[0].timestamp

  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].timestamp - dayStart > 24 * 3600 * 1000) {
      dailyReturns.push(dayPnL)
      dayPnL = 0
      dayStart = sorted[i].timestamp
    }
    dayPnL += pnls[i]
  }
  if (dayPnL !== 0) dailyReturns.push(dayPnL)

  const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / Math.max(1, dailyReturns.length)
  const variance = dailyReturns.reduce((sum, r) => sum + (r - avgReturn) ** 2, 0) / Math.max(1, dailyReturns.length)
  const volatility = Math.sqrt(variance)

  // 3. Sharpe Ratio (annualized, assuming daily returns)
  const riskFree = 0.0001 // daily risk-free rate
  const excessReturn = avgReturn - riskFree
  const sharpeRatio = volatility > 0 ? (excessReturn / volatility) * Math.sqrt(252) : 0

  // 4. Sortino Ratio (only downside deviation)
  const downsideReturns = dailyReturns.filter(r => r - riskFree < 0)
  const downsideVariance = downsideReturns.length > 0
    ? downsideReturns.reduce((sum, r) => sum + (r - riskFree) ** 2, 0) / downsideReturns.length
    : 0
  const sortinoRatio = Math.sqrt(downsideVariance) > 0 ? (excessReturn / Math.sqrt(downsideVariance)) * Math.sqrt(252) : 0

  // 5. Calmar Ratio
  const totalReturn = pnls.reduce((a, b) => a + b, 0)
  const calmarRatio = maxDD > 0 ? totalReturn / maxDD : 0

  // 6. Exposure Concentration (Herfindahl-Hirschman Index on markets)
  const marketExposures: Record<string, number> = {}
  let totalExposure = 0
  for (const t of trades) {
    marketExposures[t.marketId] = (marketExposures[t.marketId] || 0) + t.valueUsd
    totalExposure += t.valueUsd
  }

  let hhi = 0
  for (const exposure of Object.values(marketExposures)) {
    const share = totalExposure > 0 ? exposure / totalExposure : 0
    hhi += share ** 2
  }
  const exposureConcentration = Math.round(hhi * 100)

  // 7. Sector Concentration
  const sectorExposures: Record<string, number> = {}
  for (const t of trades) {
    const cat = t.category || 'general'
    sectorExposures[cat] = (sectorExposures[cat] || 0) + t.valueUsd
  }

  let sectorHhi = 0
  for (const exposure of Object.values(sectorExposures)) {
    const share = totalExposure > 0 ? exposure / totalExposure : 0
    sectorHhi += share ** 2
  }
  const sectorConcentration = Math.round(sectorHhi * 100)

  // Risk Score: Higher is better (less risky)
  // maxDD: 0% = 100, 50% = 0
  const ddScore = Math.max(0, 100 - maxDD * 200)
  // Sharpe: 3+ = 100, 0 = 0
  const sharpeScore = Math.min(100, Math.max(0, sharpeRatio * 33))
  // Exposure: HHI < 0.1 = 100, HHI > 0.5 = 0
  const exposureScore = Math.max(0, 100 - (hhi - 0.1) * 200)

  const riskScore = Math.round(ddScore * 0.4 + sharpeScore * 0.3 + exposureScore * 0.3)

  return {
    maxDrawdown: Math.round(maxDD * 10000) / 100,
    volatility: Math.round(volatility * 100) / 100,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    sortinoRatio: Math.round(sortinoRatio * 100) / 100,
    calmarRatio: Math.round(calmarRatio * 100) / 100,
    exposureConcentration,
    sectorConcentration,
    riskScore: Math.max(0, Math.min(100, riskScore)),
  }
}
