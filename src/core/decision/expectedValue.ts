import { ExpectedValue } from "./types";

/**
 * Compute real expected value of an opportunity.
 * NOT just gross spread — factors in fees, slippage, decay, and toxicity.
 */
export function computeExpectedValue(
  grossBps: number,
  feesBps: number,
  slippageBps: number,
  survivalProb: number,
  fillProb: number,
  toxicityScore: number,
): ExpectedValue {
  const net = grossBps - feesBps;
  const slippageAdjusted = net - slippageBps;

  // Decay: opportunity shrinks over time
  const decay = slippageAdjusted * (1 - survivalProb);

  // Toxicity: penalty for toxic environments
  const toxicityPenalty = toxicityScore * net;

  const finalNet = slippageAdjusted - decay - toxicityPenalty;

  return {
    gross: Math.round(grossBps * 100) / 100,
    fees: Math.round(feesBps * 100) / 100,
    slippage: Math.round(slippageBps * 100) / 100,
    decay: Math.round(decay * 100) / 100,
    toxicityPenalty: Math.round(toxicityPenalty * 100) / 100,
    net: Math.round(finalNet * 100) / 100,
  };
}
