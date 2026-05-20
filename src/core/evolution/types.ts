export interface FeatureROI {
  featureName: string;
  captureDelta: number;
  sharpeDelta: number;
  leakageDelta: number;
  latencyPenalty: number;
  roiScore: number;
  enabled: boolean;
}

export interface ComplexityMetrics {
  pipelineDepth: number;
  averageDecisionBranches: number;
  recomputationCount: number;
  score: number;
}

export interface EfficiencyMetrics {
  capturePerMs: number;
  pnlPerMs: number;
  leakagePerMs: number;
  bundleWinPerMs: number;
}

export interface RegimeParams {
  timing: string;
  slippageMultiplier: number;
  feePolicy: string;
  confidenceThreshold: number;
  aggressiveness: number;
}
