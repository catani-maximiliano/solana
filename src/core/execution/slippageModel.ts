import { SlippageEstimate } from "./types";

/**
 * Dynamic slippage model based on liquidity, velocity, and toxicity.
 * Replaces fixed slippage with a realistic estimate.
 */
export function estimateSlippage(
  tradeSizeUsd: number,
  liquidity: number,
  velocity: number,
  toxicity: number,
): SlippageEstimate {
  if (liquidity <= 0) return { expected: 100, worstCase: 500, confidence: 0, impactBps: 100 };

  const ratio = tradeSizeUsd / Math.max(1, liquidity);

  // Base slippage from ratio
  let expected: number;
  if (ratio < 0.001) expected = 0.5;
  else if (ratio < 0.005) expected = 1;
  else if (ratio < 0.01) expected = 2;
  else if (ratio < 0.05) expected = 5;
  else if (ratio < 0.1) expected = 10;
  else expected = 20;

  // Velocity penalty: high velocity = more slippage (fast moving markets)
  const velocityPenalty = Math.min(5, velocity / 10);

  // Toxicity penalty: toxic pools have worse fills
  const toxicityPenalty = toxicity * 3;

  // Worst case: double + penalties
  const worstCase = expected * 2 + velocityPenalty + toxicityPenalty;

  // Confidence: lower for toxic/high velocity
  const confidence = Math.max(0, Math.min(1, 1 - (velocityPenalty + toxicityPenalty) / 20));

  const impactBps = expected + velocityPenalty;

  return {
    expected: Math.round(expected * 10) / 10,
    worstCase: Math.round(worstCase * 10) / 10,
    confidence: Math.round(confidence * 100) / 100,
    impactBps: Math.round(impactBps * 10) / 10,
  };
}
