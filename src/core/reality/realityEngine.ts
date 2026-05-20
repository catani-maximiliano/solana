import { RealityScore } from "./types";
import { estimateLanding } from "./landingProbability";
import { estimatePartialFill } from "./partialFillModel";
import { estimatePriorityFeeCompetition } from "./priorityFeeCompetition";
import { estimateBundleContention } from "./bundleContention";
import { estimateRollbackRisk } from "./rollbackRisk";
import { estimateExecutionFailure } from "./executionFailureModel";
import { computeRealityScore } from "./executionRealityScore";
import { realizedVsExpected } from "./realizedVsExpected";
import { logInfo, logSuccess } from "../../logger";

export interface RealityInput {
  spreadBps: number;
  liquidity: number;
  tradeSizeUsd: number;
  competitionDensity: string;
  estimatedBots: number;
  urgency: number;
  volatility: string;
  slotLag: number;
  toxicity: string;
  takerRatio: number;
  computeUnits: number;
  congestion: string;
  blockSpace: string;
  spreadSurvivalMs: number;
}

export function analyzeExecutionReality(input: RealityInput): RealityScore {
  const landing = estimateLanding(0.5, input.competitionDensity, input.spreadSurvivalMs);
  const partialFill = estimatePartialFill(input.liquidity, input.tradeSizeUsd, input.toxicity, input.takerRatio);
  const feeComp = estimatePriorityFeeCompetition(input.spreadBps, input.competitionDensity, input.urgency);
  const bundle = estimateBundleContention(input.spreadBps, input.estimatedBots);
  const rollback = estimateRollbackRisk(input.volatility, input.slotLag);
  const failure = estimateExecutionFailure(input.computeUnits, input.congestion, input.blockSpace);
  const score = computeRealityScore(landing, partialFill, bundle, rollback, failure);

  logInfo(`[REALITY] landing=${score.landing}% partial=${score.partialFill}% rollback=${score.rollback}% bundle=${score.bundleCompetition} failure=${score.failure}% realityScore=${score.score}`);
  logInfo(`  priorityFee: recommended=${feeComp.recommendedMicroLamports} market=${feeComp.marketMicroLamports} pctl=${feeComp.percentile}`);

  if (score.score < 40) {
    logInfo(`[REALITY] ⚠️ Low reality score: ${score.score} — opportunity may not be capturable`);
  }

  return score;
}

export function logRealitySummary(): void {
  logSuccess(`━━━━━━━━ [REALITY ENGINE] ──────────`);
  logInfo(`Landing probability: avg`);
  logInfo(`Avg alpha leakage: ${realizedVsExpected.getAlphaLeakage().toFixed(4)} USD`);
  logInfo(`Missed alpha: ${realizedVsExpected.getMissedAlpha().toFixed(4)} USD`);
  logInfo(`Partial fill rate: tracked`);
  logInfo(`Bundle competition: modeled`);
  logInfo(`Reality-adjusted EV: computed per candidate`);
  logSuccess(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}
