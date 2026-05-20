import { BundleLikelihood } from "./types";

export function estimateBundleLikelihood(spreadBps: number, volatility: string): BundleLikelihood {
  // Bundles are more common for high-value opportunities
  let probability = 0;

  if (spreadBps > 30) probability += 0.3;
  if (spreadBps > 50) probability += 0.3;
  if (spreadBps > 100) probability += 0.2;

  // Volatile markets have more bundles
  if (volatility === "HIGH") probability += 0.15;
  if (volatility === "EXTREME") probability += 0.25;

  probability = Math.min(0.95, probability);

  const estimatedBundles = probability > 0.5 ? Math.round(probability * 3) : 0;

  return {
    probability: Math.round(probability * 100) / 100,
    estimatedBundles,
  };
}
