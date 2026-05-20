import { ExecutionProbability } from "./types";

export function computeExecutionProbability(
  persistenceScore: number,
  liquidityConf: number,
  totalLatencyMs: number,
  spreadBps: number,
): ExecutionProbability {
  // Fill chance: based on liquidity depth
  const estimatedFillChance = Math.min(1, liquidityConf * 0.8 + 0.2);

  // Latency risk: higher latency = lower chance
  const latencyRisk = Math.min(1, totalLatencyMs / 2000);

  // Competition risk: higher spread = more competition
  const competitionRisk = Math.min(1, spreadBps / 100);

  // Slippage risk: inverse of liquidity
  const slippageRisk = Math.max(0, 1 - liquidityConf);

  // Overall probability
  const probability =
    persistenceScore * 0.30 +
    estimatedFillChance * 0.25 +
    (1 - latencyRisk) * 0.20 +
    (1 - competitionRisk) * 0.15 +
    (1 - slippageRisk) * 0.10;

  return {
    probability: Math.round(Math.min(1, probability) * 100) / 100,
    estimatedFillChance,
    latencyRisk: Math.round(latencyRisk * 100) / 100,
    competitionRisk: Math.round(competitionRisk * 100) / 100,
    slippageRisk: Math.round(slippageRisk * 100) / 100,
    confidence: Math.round(Math.min(1, probability) * 100) / 100,
  };
}
