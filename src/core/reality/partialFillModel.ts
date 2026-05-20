import { PartialFillEstimate } from "./types";

export function estimatePartialFill(
  liquidity: number,
  tradeSizeUsd: number,
  toxicity: string,
  takerRatio: number,
): PartialFillEstimate {
  const liqRatio = tradeSizeUsd / Math.max(1, liquidity);
  let probability = 0;
  let expectedFillPct = 100;

  // Low liquidity relative to trade size = higher partial fill chance
  if (liqRatio > 0.1) {
    probability = 0.5;
    expectedFillPct = Math.max(50, 100 - liqRatio * 200);
  } else if (liqRatio > 0.05) {
    probability = 0.25;
    expectedFillPct = Math.max(80, 100 - liqRatio * 100);
  }

  // Toxicity increases partial fill risk
  if (toxicity === "TOXIC") { probability += 0.15; expectedFillPct -= 10; }
  if (toxicity === "RISKY") { probability += 0.05; }

  // High taker activity increases chance
  if (takerRatio > 0.7) probability += 0.1;

  const slippageImpact = (100 - expectedFillPct) * 0.5;

  return {
    probability: Math.round(Math.min(1, probability) * 100) / 100,
    expectedFillPct: Math.round(Math.max(10, expectedFillPct)),
    slippageImpact: Math.round(slippageImpact * 100) / 100,
  };
}
