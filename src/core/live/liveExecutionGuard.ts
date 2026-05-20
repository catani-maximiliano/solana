import { LiveExecutionGuardResult } from "./types";

const MIN_REALITY_SCORE = 40;
const MIN_LANDING_PROB = 0.4;
const MAX_SLIPPAGE_BPS = 15;

export function checkExecutionGuard(
  regime: string,
  toxicity: string,
  realityScore: number,
  landingProb: number,
  slippageBps: number,
  congestion: string,
): LiveExecutionGuardResult {
  if (regime === "MEV_SWARM") return { allowed: false, reason: "MEV_SWARM regime — high frontrun risk", riskScore: 95 };
  if (toxicity === "HIGH") return { allowed: false, reason: "High toxicity pool", riskScore: 85 };
  if (realityScore < MIN_REALITY_SCORE) return { allowed: false, reason: `Reality score ${realityScore} < ${MIN_REALITY_SCORE}`, riskScore: 70 };
  if (landingProb < MIN_LANDING_PROB) return { allowed: false, reason: `Landing probability ${landingProb} < ${MIN_LANDING_PROB}`, riskScore: 65 };
  if (slippageBps > MAX_SLIPPAGE_BPS) return { allowed: false, reason: `Slippage ${slippageBps}bps > ${MAX_SLIPPAGE_BPS}bps`, riskScore: 60 };
  if (congestion === "HIGH") return { allowed: false, reason: "High congestion", riskScore: 55 };

  return { allowed: true, reason: "All checks passed", riskScore: 0 };
}
