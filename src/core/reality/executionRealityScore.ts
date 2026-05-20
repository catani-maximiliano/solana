import { RealityScore, LandingProbability, PartialFillEstimate, BundleContention, RollbackRisk, ExecutionFailureModel } from "./types";

export function computeRealityScore(
  landing: LandingProbability,
  partialFill: PartialFillEstimate,
  bundle: BundleContention,
  rollback: RollbackRisk,
  failure: ExecutionFailureModel,
): RealityScore {
  const landingScore = landing.nextBlock * 40;
  const partialScore = (1 - partialFill.probability) * 15;
  const bundleScore = Math.max(0, 1 - bundle.outbidProb) * 15;
  const rollbackScore = (1 - rollback.orphanProb - rollback.reorgProb) * 15;
  const failureScore = (1 - failure.txFailureProb - failure.blockMissedProb) * 15;

  const total = landingScore + partialScore + bundleScore + rollbackScore + failureScore;

  const bundleLevel: "LOW" | "MEDIUM" | "HIGH" = bundle.estimatedBundles > 5 ? "HIGH" : bundle.estimatedBundles > 2 ? "MEDIUM" : "LOW";

  return {
    landing: Math.round(landing.nextBlock * 100),
    partialFill: Math.round(partialFill.probability * 100),
    rollback: Math.round((rollback.orphanProb + rollback.reorgProb) * 100),
    bundleCompetition: bundleLevel,
    failure: Math.round((failure.txFailureProb + failure.blockMissedProb) * 100),
    score: Math.round(Math.min(100, Math.max(0, total))),
  };
}
