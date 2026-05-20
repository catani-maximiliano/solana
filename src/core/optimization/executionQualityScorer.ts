import { ExecutionQualityScore } from "./types";

export function scoreExecutionQuality(
  fillPct: number,
  expectedSlippage: number,
  realizedSlippage: number,
  latencyMs: number,
  captureRate: number,
  bundleWon: boolean,
): ExecutionQualityScore {
  const fill = Math.min(1, fillPct / 100) * 25;
  const slippageScore = Math.max(0, 25 - (realizedSlippage - expectedSlippage) * 5);
  const latencyScore = Math.max(0, 25 - latencyMs / 10);
  const captureScore = Math.min(25, captureRate * 0.25);
  const bundleScore = bundleWon ? 25 : 0;

  const total = Math.min(100, Math.round(fill + slippageScore + latencyScore + captureScore + bundleScore));

  return {
    fill: Math.round(fill),
    slippage: Math.round(Math.max(0, slippageScore)),
    latency: Math.round(Math.max(0, latencyScore)),
    capture: Math.round(captureScore),
    bundleSuccess: bundleScore,
    total,
  };
}
