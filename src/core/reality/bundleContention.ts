import { BundleContention } from "./types";

export function estimateBundleContention(
  spreadBps: number,
  estimatedBots: number,
): BundleContention {
  const estimatedBundles = Math.max(0, Math.round(estimatedBots * 0.3 * (spreadBps / 20)));

  // Outbid probability increases with more bundles
  const outbidProb = Math.min(0.9, estimatedBundles * 0.1);

  // Expected rank: higher = worse position
  const expectedRank = Math.max(1, Math.round(estimatedBundles * 0.5 + 1));

  return {
    estimatedBundles,
    outbidProb: Math.round(outbidProb * 100) / 100,
    expectedRank,
  };
}
