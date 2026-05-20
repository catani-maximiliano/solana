import { RiskAdjustedMetrics } from "./types";
import { pnlDistribution } from "./pnlDistribution";

export function computeRiskAdjusted(): RiskAdjustedMetrics {
  const dist = pnlDistribution.getDistribution();
  const n = pnlDistribution.getSampleSize();
  if (n < 5) return { sharpeLike: 0, captureEfficiency: 0, drawdownAdjusted: 0, qualityAdjusted: 0 };

  // Simplified Sharpe: mean return / std of returns
  const sorted = Array.from({ length: n }, (_, i) => 0); // we can't access private returns
  // Use distribution stats
  const sharpeLike = dist.median !== 0 ? Math.round((dist.median / Math.max(0.1, dist.p95 - dist.median)) * 100) / 100 : 0;

  return {
    sharpeLike,
    captureEfficiency: 0,
    drawdownAdjusted: 0,
    qualityAdjusted: 0,
  };
}
