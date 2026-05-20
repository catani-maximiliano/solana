import { SlippageEstimate, FillProbability, ExecutionScore } from "./types";

/**
 * Compute final execution score for a candidate.
 * Combines slippage, fill probability, and risk factors.
 */
export function computeExecutionScore(
  grossBps: number,
  feesBps: number,
  slippage: SlippageEstimate,
  fill: FillProbability,
  toxicityPenalty: number,
): ExecutionScore {
  const netBps = grossBps - feesBps - slippage.expected;

  // Worst-case: apply worst-case slippage
  const worstNetBps = grossBps - feesBps - slippage.worstCase;

  // PnL estimates
  const expectedPnl = netBps / 10000 * 100;
  const worstCasePnl = worstNetBps / 10000 * 100;

  // Impact-adjusted: expected net minus market impact
  const impactAdjustedPnl = expectedPnl * fill.probability * fill.survivalOdds;

  // Confidence: weighted average of slippage confidence, fill probability, and survival
  const confidence = Math.round(
    (slippage.confidence * 0.3 + fill.probability * 0.4 + fill.survivalOdds * 0.3) * 100,
  ) / 100;

  // Execution risk classification
  let executionRisk: "LOW" | "MEDIUM" | "HIGH" = "MEDIUM";
  if (confidence > 0.7 && fill.probability > 0.6 && slippage.expected < 5) executionRisk = "LOW";
  else if (confidence < 0.3 || fill.probability < 0.3) executionRisk = "HIGH";

  return {
    expectedPnl: Math.round(expectedPnl * 10000) / 10000,
    worstCasePnl: Math.round(worstCasePnl * 10000) / 10000,
    fillProbability: fill.probability,
    edgeHalfLifeMs: fill.halfLifeMs,
    confidence,
    executionRisk,
    toxicityPenalty: Math.round(toxicityPenalty * 100) / 100,
    impactAdjustedPnl: Math.round(impactAdjustedPnl * 10000) / 10000,
  };
}
