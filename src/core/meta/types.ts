export interface SignalWeights {
  flow: number;
  toxicity: number;
  timing: number;
  alpha: number;
  competition: number;
  microstructure: number;
  spreadPersistence: number;
  orderbook: number;
}

export interface RegimeType {
  name: string;
  volatility: string;
  crowding: string;
  description: string;
}

export interface FeatureImportance {
  signal: string;
  contribution: number;
  direction: "POSITIVE" | "NEGATIVE";
  confidence: number;
}

export interface DecisionOutcome {
  features: Record<string, number>;
  wasSuccessful: boolean;
  falsePositive: boolean;
  executionViable: boolean;
  regime: string;
}

export interface MetaReport {
  topContributors: FeatureImportance[];
  worstPredictors: FeatureImportance[];
  falsePositiveReducers: string[];
  regime: string;
  weights: SignalWeights;
  totalDecisions: number;
  successRate: number;
}
