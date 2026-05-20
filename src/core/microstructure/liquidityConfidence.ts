import { LiquidityConfidence } from "./types";

export function computeLiquidityConfidence(
  liquidity: number,
  updateFrequency: number,
  recentDrift: number,
): LiquidityConfidence {
  // Depth score: higher liquidity = better
  const depthScore = Math.min(1, liquidity / 1_000_000);

  // Stability score: lower drift = more stable
  const stabilityScore = Math.max(0, 1 - recentDrift);

  // Update score: more frequent updates = more reliable
  const updateScore = Math.min(1, updateFrequency / 5);

  // Drift score: penalty for large changes
  const driftScore = Math.max(0, 1 - recentDrift * 2);

  // Overall confidence
  const confidence = depthScore * 0.35 + stabilityScore * 0.25 + updateScore * 0.25 + driftScore * 0.15;

  return {
    depthScore: Math.round(depthScore * 100) / 100,
    stabilityScore: Math.round(stabilityScore * 100) / 100,
    updateScore: Math.round(updateScore * 100) / 100,
    driftScore: Math.round(driftScore * 100) / 100,
    confidence: Math.round(Math.min(1, confidence) * 100) / 100,
  };
}
