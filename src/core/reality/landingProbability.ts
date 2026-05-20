import { LandingProbability } from "./types";

export function estimateLanding(
  priorityFeePercentile: number,
  competitionDensity: string,
  spreadSurvivalMs: number,
): LandingProbability {
  // Higher fee percentile = higher landing chance
  const feeBonus = priorityFeePercentile * 0.3;

  // Competition penalty
  const compPenalty = competitionDensity === "HIGH" ? 0.3 : competitionDensity === "MEDIUM" ? 0.15 : 0;

  // Survival bonus: more time = higher chance
  const survivalBonus = Math.min(0.3, spreadSurvivalMs / 2000 * 0.3);

  const nextBlock = Math.min(0.95, Math.max(0.05, 0.5 + feeBonus - compPenalty + survivalBonus));
  const plus1Block = Math.min(0.99, nextBlock * 0.7 + 0.3);
  const missed = Math.max(0.01, 1 - nextBlock - plus1Block * 0.3);
  const confidence = Math.min(1, priorityFeePercentile + 0.2);

  return {
    nextBlock: Math.round(nextBlock * 100) / 100,
    plus1Block: Math.round(plus1Block * 100) / 100,
    missed: Math.round(missed * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
  };
}
