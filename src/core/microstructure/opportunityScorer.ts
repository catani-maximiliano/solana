import { MicrostructureReport, LatencyEstimate, LiquidityConfidence, ExecutionProbability, VolatilitySnapshot, CandidateLifecycle } from "./types";

/**
 * Compute final opportunity score based on microstructure factors.
 *
 * finalScore =
 *   spreadQuality * persistence * liquidityConfidence * executionProbability * latencyAdvantage
 *   - volatilityPenalty - decayPenalty
 */
export function computeFinalScore(
  spreadBps: number,
  persistenceScore: number,
  latencyEst: LatencyEstimate,
  liquidityConf: LiquidityConfidence,
  execProb: ExecutionProbability,
  volatility: VolatilitySnapshot,
  lifecycle: CandidateLifecycle,
  decayBps: number,
): MicrostructureReport {
  // Spread quality
  const spreadQuality = Math.min(1, spreadBps / 50);

  // Latency advantage: lower latency = higher multiplier
  const latencyAdvantage = Math.max(0.1, 1 - latencyEst.totalLatencyMs / 3000);

  // Volatility penalty
  const volPenalty = volatility.regime === "EXTREME" ? 0.5 : volatility.regime === "HIGH" ? 0.25 : volatility.regime === "MEDIUM" ? 0.1 : 0;

  // Decay penalty
  const decayPenalty = Math.max(0, Math.abs(decayBps) / 20);

  // Lifecycle multiplier
  const lifeMultiplier = lifecycle === "EXECUTABLE" ? 1.0 : lifecycle === "STABLE" ? 0.7 : lifecycle === "NEW" ? 0.3 : lifecycle === "DECAYING" ? 0.2 : 0;

  // Final score
  const raw =
    spreadQuality *
    persistenceScore *
    liquidityConf.confidence *
    execProb.probability *
    latencyAdvantage *
    lifeMultiplier;

  const finalScore = Math.max(0, raw - volPenalty - decayPenalty);

  return {
    persistenceScore,
    latencyEstimate: latencyEst,
    liquidityConfidence: liquidityConf,
    executionProbability: execProb,
    volatility,
    lifecycle,
    finalScore: Math.round(finalScore * 100) / 100,
  };
}
