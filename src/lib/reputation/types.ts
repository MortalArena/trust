export interface ReputationTrade {
  id: string
  traderId: string
  marketId: string
  conditionId: string
  marketTitle?: string
  category?: string
  side: string
  outcome: string
  price: number
  shares: number
  valueUsd: number
  feeUsd?: number
  entryProbability?: number
  timestamp: number
  closedAt?: number
  resolvedOutcome?: 0 | 1
}

export interface ReputationPosition {
  id: string
  traderId: string
  marketId: string
  marketTitle?: string
  outcome: string
  avgEntry: number
  currentProbability: number
  quantity: number
  unrealizedPnL: number
  realizedPnL: number
  openedAt: number
  closedAt?: number
}

export interface ForecastMetrics {
  brierScore: number
  logLoss: number
  calibrationScore: number
  predictiveScore: number
}

export interface AlphaMetrics {
  alpha24h: number
  alpha7d: number
  sectorAlpha: number
  alphaScore: number
}

export interface ConfidenceMetrics {
  sampleSize: number
  tradesCount: number
  avgTradesPerDay: number
  activeWeeks: number
  confidenceMultiplier: number
  confidenceScore: number
}

export interface BehaviorFlags {
  revengeTrading: boolean
  martingale: boolean
  fomo: boolean
  overconfidence: boolean
  panicExit: boolean
}

export interface BehaviorMetrics {
  revengeTradingScore: number
  fomoScore: number
  martingaleScore: number
  disciplineScore: number
  behaviorScore: number
  flags: BehaviorFlags
}

export interface RiskMetrics {
  maxDrawdown: number
  volatility: number
  sharpeRatio: number
  sortinoRatio: number
  calmarRatio: number
  exposureConcentration: number
  sectorConcentration: number
  riskScore: number
}

export interface ReputationOutput {
  predictiveScore: number
  alphaScore: number
  confidenceScore: number
  behaviorScore: number
  riskScore: number
  masterPMI: number
  forecastMetrics: ForecastMetrics
  alphaMetrics: AlphaMetrics
  confidenceMetrics: ConfidenceMetrics
  behaviorMetrics: BehaviorMetrics
  riskMetrics: RiskMetrics
}
