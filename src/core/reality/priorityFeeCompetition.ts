import { PriorityFeeCompetition } from "./types";

export function estimatePriorityFeeCompetition(
  spreadBps: number,
  competitionDensity: string,
  urgency: number,
): PriorityFeeCompetition {
  // Base market fee from congestion
  const marketBase = competitionDensity === "HIGH" ? 40_000 : competitionDensity === "MEDIUM" ? 20_000 : 10_000;

  // Spread premium: higher spread = more bots willing to pay
  const spreadPremium = Math.min(50_000, spreadBps * 2000);

  // Urgency boost
  const urgencyBoost = Math.max(0, urgency * 30_000);

  const marketMicroLamports = marketBase;
  const recommended = marketBase + spreadPremium + urgencyBoost;
  const percentile = Math.min(99, Math.round(50 + spreadBps * 1.5 + urgency * 20));

  return {
    recommendedMicroLamports: recommended,
    marketMicroLamports,
    percentile,
  };
}
