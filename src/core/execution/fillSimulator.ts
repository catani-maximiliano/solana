import { FillProbability } from "./types";

/**
 * Simulate fill probability based on latency, liquidity, and spread persistence.
 */
export function simulateFill(
  totalLatencyMs: number,
  liquidity: number,
  spreadBps: number,
  persistenceScore: number,
): FillProbability {
  // Base probability decreases with latency
  const baseProb = Math.max(0, 1 - totalLatencyMs / 2000);

  // Liquidity boosts fill chance
  const liqBonus = Math.min(0.3, liquidity / 10_000_000 * 0.3);

  // Higher spreads attract more competition → lower fill probability
  const compPenalty = Math.min(0.5, spreadBps / 100 * 0.5);

  // Persistence shows the edge has staying power
  const persistBonus = persistenceScore * 0.2;

  const probability = Math.min(1, Math.max(0, baseProb + liqBonus - compPenalty + persistBonus));

  // Edge half-life: how long before the edge is likely gone
  const halfLifeMs = Math.max(50, Math.round(500 * (1 - totalLatencyMs / 3000) * persistenceScore));

  // Revert risk: probability the edge disappears before we fill
  const revertRisk = Math.min(1, Math.max(0, 1 - probability * 0.7));

  // Survival odds: edge survives long enough to execute
  const survivalOdds = Math.min(1, halfLifeMs / (totalLatencyMs + halfLifeMs));

  return {
    probability: Math.round(probability * 100) / 100,
    halfLifeMs,
    revertRisk: Math.round(revertRisk * 100) / 100,
    survivalOdds: Math.round(survivalOdds * 100) / 100,
  };
}
