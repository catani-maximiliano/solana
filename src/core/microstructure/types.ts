export interface LatencyEstimate {
  ingestLatencyMs: number;
  chainLatencyMs: number;
  totalLatencyMs: number;
  confidence: number;
}

export interface LiquidityConfidence {
  depthScore: number;
  stabilityScore: number;
  updateScore: number;
  driftScore: number;
  confidence: number; // 0-1
}

export interface ExecutionProbability {
  probability: number;
  estimatedFillChance: number;
  latencyRisk: number;
  competitionRisk: number;
  slippageRisk: number;
  confidence: number;
}

export interface EdgeAgeInfo {
  pool: string;
  createdAt: number;
  lastUpdate: number;
  updateFrequency: number;
  decayScore: number;
  freshnessScore: number;
  active: boolean;
}

export type CandidateLifecycle = "NEW" | "STABLE" | "EXECUTABLE" | "DECAYING" | "DEAD";
export type VolatilityRegime = "LOW" | "MEDIUM" | "HIGH" | "EXTREME";

export interface VolatilitySnapshot {
  regime: VolatilityRegime;
  spreadVariance: number;
  tickVariance: number;
  liquidityDrift: number;
  burstDetected: boolean;
  windowMs: number;
}

export interface MicrostructureReport {
  persistenceScore: number;
  latencyEstimate: LatencyEstimate;
  liquidityConfidence: LiquidityConfidence;
  executionProbability: ExecutionProbability;
  volatility: VolatilitySnapshot;
  lifecycle: CandidateLifecycle;
  finalScore: number;
}
