import { ExecutionFailureModel } from "./types";

export function estimateExecutionFailure(
  computeUnits: number,
  congestion: string,
  blockSpace: string,
): ExecutionFailureModel {
  const txFailureProb = congestion === "HIGH" ? 0.08 : congestion === "MEDIUM" ? 0.03 : 0.01;
  const txDelayedProb = congestion === "HIGH" ? 0.2 : congestion === "MEDIUM" ? 0.1 : 0.03;
  const slippageExceededProb = blockSpace === "CROWDED" ? 0.15 : 0.05;
  const cuExhaustionProb = computeUnits > 400_000 ? 0.1 : 0.02;
  const blockMissedProb = congestion === "HIGH" ? 0.12 : 0.03;

  return {
    txFailureProb: Math.round(txFailureProb * 100) / 100,
    txDelayedProb: Math.round(txDelayedProb * 100) / 100,
    slippageExceededProb: Math.round(slippageExceededProb * 100) / 100,
    cuExhaustionProb: Math.round(cuExhaustionProb * 100) / 100,
    blockMissedProb: Math.round(blockMissedProb * 100) / 100,
  };
}
