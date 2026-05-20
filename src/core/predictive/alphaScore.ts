import { AlphaScore, BreakoutSignal, LiquidityCollapseSignal, SweepSignal, MomentumSignal, VolatilityForecast } from "./types";

export function computeAlphaScore(
  breakout: BreakoutSignal,
  collapse: LiquidityCollapseSignal,
  sweep: SweepSignal,
  momentum: MomentumSignal,
  volatility: VolatilityForecast,
): AlphaScore {
  const breakoutScore = breakout.probability / 100;
  const collapseScore = collapse.probability;
  const sweepScore = sweep.probability;
  const momentumScore = momentum.strength;
  const volScore = volatility.regime === "LOW" ? 0.2 : volatility.regime === "MEDIUM" ? 0.5 : volatility.regime === "HIGH" ? 0.8 : 0.95;

  // Weighted fusion
  const score =
    breakoutScore * 0.25 +
    (1 - collapseScore) * 0.15 +
    sweepScore * 0.2 +
    momentumScore * 0.2 +
    volScore * 0.2;

  return {
    score: Math.round(Math.min(1, score) * 100),
    breakout: breakout.probability,
    collapse: Math.round(collapse.probability * 100),
    sweep: Math.round(sweep.probability * 100),
    momentum: Math.round(momentumScore * 100),
    volatility: Math.round(volScore * 100),
    confidence: Math.round(score * 100) / 100,
  };
}
