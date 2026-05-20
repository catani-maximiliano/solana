export interface TrackedOpportunity {
  pair: string;
  dexes: string[];
  detectedAt: number;
  grossBps: number;
  netBps: number;
  peakBps: number;
  decayBps: number;
  lifetimeMs: number;
  diedAt: number;
  survivedMs: number;
  fillAtMs: number[];
}

export interface SurvivalAtLatency {
  at50ms: boolean;
  at100ms: boolean;
  at250ms: boolean;
  at500ms: boolean;
  netAt50ms: number;
  netAt250ms: number;
  netAt500ms: number;
}

export interface FillReality {
  probability: number;
  estimatedFillTimeMs: number;
  liquidityConsumed: number;
  takerAggression: number;
}

export interface FalsePositiveReport {
  total: number;
  diedBefore100ms: number;
  diedBefore250ms: number;
  diedBefore500ms: number;
  neverExecutable: number;
}

export interface CalibrationResult {
  slippageMultiplier: number;
  survivalThresholdMs: number;
  fillProbabilityBase: number;
  toxicityPenaltyMultiplier: number;
  confidenceThreshold: number;
}

export interface TruthReport {
  opportunitiesTracked: number;
  medianLifetimeMs: number;
  p95LifetimeMs: number;
  falsePositives: number;
  survivalAt100ms: number;
  survivalAt250ms: number;
  survivalAt500ms: number;
  avgDecay: number;
  executableRate: number;
}
