/**
 * Neg Risk Scanner — Inspired by Resolve Markets
 * 
 * Detects negative risk opportunities when market prices sum to beyond 100%.
 * This means the market is mispriced and there's an arbitrage opportunity.
 */

export interface NegRiskOpportunity {
  id: string;
  title: string;
  contracts: {
    question: string;
    outcome: string;
    probability: number;
  }[];
  totalProbability: number;
  negRisk: number; // How much over 100%
  expectedReturn: number;
  confidence: number;
}

export async function scanNegRiskOpportunities(markets: any[]): Promise<NegRiskOpportunity[]> {
  const opportunities: NegRiskOpportunity[] = [];
  
  // Group markets by related events (same question pattern)
  const eventGroups = new Map<string, any[]>();
  
  for (const market of markets) {
    const title = market.question || '';
    // Extract base event (e.g., "Will X win?" from "Will X win? (YES)" and "Will X win? (NO)")
    const baseTitle = title.replace(/\s*\((YES|No|Yes|TRUE|FALSE)\)\s*$/i, '').trim();
    
    if (!eventGroups.has(baseTitle)) {
      eventGroups.set(baseTitle, []);
    }
    eventGroups.get(baseTitle)!.push(market);
  }

  for (const [baseTitle, contracts] of eventGroups) {
    if (contracts.length < 2) continue;

    // Calculate total probability
    const totalProb = contracts.reduce((sum, m) => sum + (m.yes_price || m.probability || 0), 0);
    const negRisk = totalProb - 100;

    if (negRisk > 0) {
      opportunities.push({
        id: `negrisk-${baseTitle.slice(0, 20)}`,
        title: baseTitle,
        contracts: contracts.map(m => ({
          question: m.question || m.title || 'Unknown',
          outcome: m.outcome || 'YES',
          probability: m.yes_price || m.probability || 0,
        })),
        totalProbability: Math.round(totalProb * 10) / 10,
        negRisk: Math.round(negRisk * 10) / 10,
        expectedReturn: Math.round(negRisk * 0.9 * 100) / 100, // 90% of neg risk as expected return
        confidence: Math.min(95, Math.round(negRisk * 5 + 50)), // Higher neg risk = higher confidence
      });
    }
  }

  return opportunities.sort((a, b) => b.negRisk - a.negRisk);
}
