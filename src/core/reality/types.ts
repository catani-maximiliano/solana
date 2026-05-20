export interface LandingProbability {
  nextBlock: number;
  plus1Block: number;
  missed: number;
  confidence: number;
}

export interface PartialFillEstimate {
  probability: number;
  expectedFillPct: number;
  slippageImpact: number;
}

export interface PriorityFeeCompetition {
  recommendedMicroLamports: number;
  marketMicroLamports: number;
  percentile: number;
}

export interface BundleContention {
  estimatedBundles: number;
  outbidProb: number;
  expectedRank: number;
}

export interface RollbackRisk {
  orphanProb: number;
  reorgProb: number;
  confirmationRisk: "LOW" | "MEDIUM" | "HIGH";
}

export interface ExecutionFailureModel {
  txFailureProb: number;
  txDelayedProb: number;
  slippageExceededProb: number;
  cuExhaustionProb: number;
  blockMissedProb: number;
}

export interface RealityScore {
  landing: number;
  partialFill: number;
  rollback: number;
  bundleCompetition: "LOW" | "MEDIUM" | "HIGH";
  failure: number;
  score: number;
}
