export interface ExperimentConfig {
  id: string;
  name: string;
  params: Record<string, number | string | boolean>;
  active: boolean;
}

export interface ExperimentResult {
  experimentId: string;
  winRate: number;
  avgReturn: number;
  alphaLeakage: number;
  falsePositiveRate: number;
  realityScore: number;
  samples: number;
}

export interface StrategyVersion {
  version: string;
  params: Record<string, number | string | boolean>;
  results: ExperimentResult[];
  timestamp: number;
}

export interface FeatureAblationResult {
  featureRemoved: string;
  winRateDelta: number;
  alphaLeakageDelta: number;
  confidenceDelta: number;
}

export interface RegimeBacktestResult {
  regime: string;
  winRate: number;
  avgReturnBps: number;
  survivalMs: number;
  sampleCount: number;
}
