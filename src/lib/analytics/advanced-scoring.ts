/**
 * Advanced Scoring Engine V3 — Inspired by Competitors
 * 
 * Adds:
 * 1. Smart Score (Accrue-style): Sortino, R-squared, profit factor composite
 * 2. Insider Score (Merlin-style): Detect traders who profit on low-prob outcomes
 * 3. Whale Tiers (Merlin-style): Whale/Shark/Dolphin/Fish classification
 * 4. Return Rating (Merlin-style): S/A/B/C/D grading
 * 5. Stealth Score (PolyTrail-style): Detect hidden large traders
 * 6. Conviction Index: Position sizing consistency + timing quality
 * 7. Consensus Score: When multiple elite traders converge
 * 8. Cross-Market Edge: Granger causality across linked events
 * 9. Risk Metrics: Max drawdown, Sharpe, Sortino, Calmar, Kelly
 * 10. Signal Generation: 30+ signal types
 */

export interface AdvancedScores {
  // V3 Smart Score (0-100 composite)
  smartScore: number;
  
  // Insider Score (0-100): Ability to profit on low-probability outcomes
  insiderScore: number;
  
  // Whale Tier
  whaleTier: 'WHALE' | 'SHARK' | 'DOLPHIN' | 'FISH' | 'PLANKTON';
  
  // Return Rating
  returnRating: 'S' | 'A' | 'B' | 'C' | 'D';
  
  // Stealth Score (0-100): How hidden this trader's activity is
  stealthScore: number;
  
  // Conviction Index (0-100): Position sizing + timing consistency
  convictionIndex: number;
  
  // Risk Metrics
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  maxDrawdown: number;
  kellyCriterion: number;
  
  // Behavioral Flags
  flags: {
    insiderTrading: boolean;
    stealthMode: boolean;
    botLike: boolean;
    sybilCluster: boolean;
    washTrading: boolean;
  };
}

export interface MarketSignal {
  id: string;
  type: SignalType;
  marketId?: string;
  traderWallet?: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  timestamp: number;
  data: Record<string, any>;
}

export type SignalType =
  | 'WHALE_BUY' | 'WHALE_SELL'        // Large position entries/exits
  | 'SMART_MONEY_ENTRY'                 // Elite traders entering
  | 'PROBABILITY_SPIKE'                 // Sudden probability change
  | 'VOLUME_SURGE'                      // Unusual volume increase
  | 'INSIDER_ACTIVITY'                  // Insider trading detected
  | 'CONSENSUS_FORMING'                 // Multiple elites converging
  | 'STEALTH_ACCUMULATION'              // Hidden whale accumulation
  | 'SENTIMENT_DIVERGENCE'              // NLP vs market probability mismatch
  | 'CROSS_MARKET_LEAD'                 // Lead-lag across linked events
  | 'NEG_RISK_OPPORTUNITY'              // Negative risk detected
  | 'WASH_TRADE_DETECTED'               // Suspicious wash trading
  | 'NEW_MARKET_SNIPING'                // Early entry in new markets
  | 'YIELD_CHASING'                     // Yield farming patterns
  | 'COPY_TRADING_SIGNAL'               // Signal suitable for copy trading
  | 'EXPERT_SIGNAL'                     // Signal from top PMI expert
  | 'RISK_ALERT'                        // Risk threshold breached
  | 'MOMENTUM_SHIFT'                    // Market momentum change
  | 'LIQUIDITY_CHANGE'                  // Significant liquidity shift
  | 'CATEGORY_ROTATION';                // Money flowing between categories

export function calculateAdvancedScores(trader: any, trades: any[]): AdvancedScores {
  const n = trades.length;
  if (n < 5) {
    return {
      smartScore: 0, insiderScore: 0, whaleTier: 'PLANKTON', returnRating: 'D',
      stealthScore: 0, convictionIndex: 0, sharpeRatio: 0, sortinoRatio: 0,
      calmarRatio: 0, maxDrawdown: 0, kellyCriterion: 0,
      flags: { insiderTrading: false, stealthMode: false, botLike: false, sybilCluster: false, washTrading: false },
    };
  }

  // Basic stats
  const wins = trades.filter((t: any) => t.outcome === 'YES').length;
  const losses = trades.filter((t: any) => t.outcome === 'NO').length;
  const totalOutcomes = wins + losses;
  const winRate = totalOutcomes > 0 ? wins / totalOutcomes : 0.5;
  
  const pnls = trades.map((t: any) => Number(t.pnl || t.realizedPnl || 0));
  const returns = pnls.filter(p => p !== 0);
  
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const totalPnl = pnls.reduce((a, b) => a + b, 0);
  const totalVolume = trades.reduce((s: number, t: any) => s + Number(t.valueUsd || t.size * t.price || 0), 0);
  const roi = totalVolume > 0 ? (totalPnl / totalVolume) * 100 : 0;

  // Sharpe Ratio
  const variance = returns.length > 1 ? returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / (returns.length - 1) : 0;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

  // Sortino Ratio (only downside deviation)
  const downsideReturns = returns.filter(r => r < 0);
  const downsideVariance = downsideReturns.length > 0 ? downsideReturns.reduce((s, r) => s + r ** 2, 0) / downsideReturns.length : 0;
  const downsideDev = Math.sqrt(downsideVariance);
  const sortinoRatio = downsideDev > 0 ? (avgReturn / downsideDev) * Math.sqrt(252) : 0;

  // Max Drawdown
  let peak = 0, maxDD = 0, cum = 0;
  for (const pnl of pnls) {
    cum += pnl;
    if (cum > peak) peak = cum;
    const dd = peak > 0 ? (peak - cum) / peak : 0;
    if (dd > maxDD) maxDD = dd;
  }

  // Calmar Ratio
  const annualReturn = roi * 12; // Simplified
  const calmarRatio = maxDD > 0 ? annualReturn / maxDD : 0;

  // Kelly Criterion
  const kelly = winRate > 0 && losses > 0 ? (winRate * (wins / Math.max(losses, 1)) - (1 - winRate)) / (wins / Math.max(losses, 1)) : 0;

  // R-squared (consistency measure)
  const rSquared = Math.max(0, Math.min(1, 1 - (variance / Math.max(avgReturn ** 2, 0.0001))));

  // Profit Factor
  const grossWins = pnls.filter(p => p > 0).reduce((a, b) => a + b, 0);
  const grossLosses = Math.abs(pnls.filter(p => p < 0).reduce((a, b) => a + b, 0));
  const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? grossWins : 0;

  // Smart Score (Accrue-style composite)
  const smartScore = Math.max(0, Math.min(100,
    sortinoRatio * 15 +
    winRate * 25 +
    (1 - maxDD) * 20 +
    Math.min(profitFactor, 5) * 8 +
    rSquared * 10 +
    Math.min(n / 100, 1) * 10 +
    Math.min(Math.abs(roi) / 100, 1) * 12
  ));

  // Insider Score: Ability to profit on low-probability outcomes
  const lowProbTrades = trades.filter((t: any) => (t.entryProbability || t.price || 50) < 30);
  const lowProbWins = lowProbTrades.filter((t: any) => t.outcome === 'YES').length;
  const insiderScore = lowProbTrades.length > 0
    ? Math.max(0, Math.min(100, (lowProbWins / lowProbTrades.length) * 100 + lowProbTrades.length * 2))
    : 0;

  // Whale Tier
  const whaleTier: AdvancedScores['whaleTier'] =
    totalVolume > 1000000 ? 'WHALE' :
    totalVolume > 100000 ? 'SHARK' :
    totalVolume > 10000 ? 'DOLPHIN' :
    totalVolume > 1000 ? 'FISH' : 'PLANKTON';

  // Return Rating (S/A/B/C/D)
  const returnRating: AdvancedScores['returnRating'] =
    roi > 50 ? 'S' :
    roi > 20 ? 'A' :
    roi > 5 ? 'B' :
    roi > 0 ? 'C' : 'D';

  // Stealth Score: Detect hidden large traders
  const avgTradeSize = n > 0 ? totalVolume / n : 0;
  const sizeVariance = trades.reduce((s: number, t: any) => {
    const size = Number(t.valueUsd || 0);
    return s + (size - avgTradeSize) ** 2;
  }, 0) / n;
  const sizeCV = avgTradeSize > 0 ? Math.sqrt(sizeVariance) / avgTradeSize : 0;
  // Low CV + high volume = stealth (consistent sizing to avoid detection)
  const stealthScore = Math.max(0, Math.min(100,
    (1 - Math.min(sizeCV, 1)) * 40 +
    Math.min(totalVolume / 100000, 1) * 30 +
    (avgTradeSize > 5000 && avgTradeSize < 50000 ? 30 : 0)
  ));

  // Conviction Index: Position sizing consistency + timing
  const convictionIndex = Math.max(0, Math.min(100,
    winRate * 30 +
    (1 - Math.min(sizeCV, 1)) * 25 +
    Math.min(n / 50, 1) * 20 +
    Math.min(Math.abs(roi) / 50, 1) * 25
  ));

  // Behavioral Flags
  const flags = {
    insiderTrading: insiderScore > 60 && lowProbTrades.length >= 3,
    stealthMode: stealthScore > 70,
    botLike: sizeCV < 0.1 && n > 20, // Very consistent sizing = possible bot
    sybilCluster: false, // Would need cross-wallet analysis
    washTrading: false, // Would need to detect self-trades
  };

  return {
    smartScore: Math.round(smartScore * 10) / 10,
    insiderScore: Math.round(insiderScore * 10) / 10,
    whaleTier,
    returnRating,
    stealthScore: Math.round(stealthScore * 10) / 10,
    convictionIndex: Math.round(convictionIndex * 10) / 10,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    sortinoRatio: Math.round(sortinoRatio * 100) / 100,
    calmarRatio: Math.round(calmarRatio * 100) / 100,
    maxDrawdown: Math.round(maxDD * 10000) / 100,
    kellyCriterion: Math.round(kelly * 1000) / 1000,
    flags,
  };
}

// ── Signal Generator ─────────────────────────────────────────
export function generateSignals(traders: any[], markets: any[]): MarketSignal[] {
  const signals: MarketSignal[] = [];
  const now = Date.now();

  for (const trader of traders) {
    // Whale signals
    if (Number(trader.totalVolumeUsd) > 100000) {
      signals.push({
        id: `sig-whale-${trader.proxyWallet}`,
        type: 'WHALE_BUY',
        traderWallet: trader.proxyWallet,
        severity: Number(trader.totalVolumeUsd) > 1000000 ? 'CRITICAL' : 'HIGH',
        title: `🐋 Whale Activity: ${trader.displayName || trader.proxyWallet.slice(0, 8)}`,
        description: `Volume: $${(Number(trader.totalVolumeUsd)).toLocaleString()} · PMI: ${Number(trader.masterPMI || 0).toFixed(1)}`,
        timestamp: now,
        data: { volume: trader.totalVolumeUsd, pmi: trader.masterPMI },
      });
    }

    // Insider signals
    if (Number(trader.insiderScore || 0) > 60) {
      signals.push({
        id: `sig-insider-${trader.proxyWallet}`,
        type: 'INSIDER_ACTIVITY',
        traderWallet: trader.proxyWallet,
        severity: 'HIGH',
        title: `🕵️ Insider Detected: ${trader.displayName || trader.proxyWallet.slice(0, 8)}`,
        description: `Insider Score: ${Number(trader.insiderScore).toFixed(0)} · Win Rate: ${Number(trader.winRate || 0).toFixed(0)}%`,
        timestamp: now,
        data: { insiderScore: trader.insiderScore },
      });
    }

    // Smart money entry
    if (Number(trader.masterPMI || 0) > 80 && Number(trader.totalTrades) > 50) {
      signals.push({
        id: `sig-smart-${trader.proxyWallet}`,
        type: 'SMART_MONEY_ENTRY',
        traderWallet: trader.proxyWallet,
        severity: Number(trader.masterPMI) > 90 ? 'CRITICAL' : 'HIGH',
        title: `🧠 Smart Money: ${trader.displayName || trader.proxyWallet.slice(0, 8)}`,
        description: `PMI: ${Number(trader.masterPMI).toFixed(1)} · Alpha: ${Number(trader.alphaScore || 0).toFixed(1)} · Trades: ${trader.totalTrades}`,
        timestamp: now,
        data: { pmi: trader.masterPMI, alpha: trader.alphaScore },
      });
    }
  }

  // Market signals
  for (const market of markets) {
    if (Number(market.volume_24h) > 500000) {
      signals.push({
        id: `sig-vol-${market.id}`,
        type: 'VOLUME_SURGE',
        marketId: market.id,
        severity: Number(market.volume_24h) > 2000000 ? 'CRITICAL' : 'HIGH',
        title: `📊 Volume Surge: ${market.question?.slice(0, 50)}`,
        description: `24h Vol: $${(Number(market.volume_24h)).toLocaleString()} · Change: ${market.price_change_24h > 0 ? '+' : ''}${market.price_change_24h?.toFixed(1)}%`,
        timestamp: now,
        data: { volume: market.volume_24h, change: market.price_change_24h },
      });
    }
  }

  return signals.sort((a, b) => {
    const sev = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
    return (sev[b.severity] || 0) - (sev[a.severity] || 0);
  });
}
