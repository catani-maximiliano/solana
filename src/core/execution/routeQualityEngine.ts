import { RouteQuality } from "./types";
import { velocityTracker } from "../flow/velocityTracker";
import { toxicFlowDetector } from "../flow/toxicFlowDetector";

/**
 * Score a route's quality based on liquidity, DEX reliability, toxicity, and flow.
 */
export function scoreRoute(
  pool: string,
  liquidity: number,
  dex: string,
) {
  const velocity = velocityTracker.getVelocity(pool);
  const toxicity = toxicFlowDetector.detect(pool);

  const liquidityDepth = Math.min(1, liquidity / 5_000_000);

  const dexReliability = dex === "Whirlpool" ? 0.9 : dex === "Raydium CLMM" ? 0.85 : 0.7;

  const toxicityLevel = toxicity.toxicity;
  const toxicityPenalty = toxicityLevel === "TOXIC" ? 0.5 : toxicityLevel === "RISKY" ? 0.25 : 0;

  // Flow imbalance
  const flowImbalance = Math.min(1, velocity / 100);

  const score = (liquidityDepth * 0.35 + dexReliability * 0.25 + (1 - toxicityPenalty) * 0.25 + (1 - flowImbalance) * 0.15) * 100;

  return {
    score: Math.round(Math.min(100, Math.max(0, score))),
    liquidityDepth: Math.round(liquidityDepth * 100) / 100,
    dexReliability,
    toxicityLevel,
    flowImbalance: Math.round(flowImbalance * 100) / 100,
    confidence: Math.round(Math.min(1, score / 100) * 100) / 100,
  } as RouteQuality;
}
