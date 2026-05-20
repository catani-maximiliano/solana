// Legacy types (for backward compatibility)
export interface SlippageEstimate {
  expected: number;
  worstCase: number;
  confidence: number;
  impactBps: number;
}

export interface FillProbability {
  probability: number;
  halfLifeMs: number;
  revertRisk: number;
  survivalOdds: number;
}

export interface ExecutionScore {
  expectedPnl: number;
  worstCasePnl: number;
  fillProbability: number;
  edgeHalfLifeMs: number;
  confidence: number;
  executionRisk: "LOW" | "MEDIUM" | "HIGH";
  toxicityPenalty: number;
  impactAdjustedPnl: number;
}

export interface RouteQuality {
  score: number;
  liquidityDepth: number;
  dexReliability: number;
  toxicityLevel: string;
  flowImbalance: number;
  confidence: number;
}

// New execution plan types
export interface ExecutionPlan {
  shouldSend: boolean;
  priority: number;
  expectedPnlBps: number;
  computeUnits: number;
  priorityFeeMicroLamports: number;
  slippageLimitBps: number;
  estimatedLatencyMs: number;
  route: string;
  pair: string;
  dexes: string[];
  dryRun: boolean;
}

export interface TxBuildResult {
  txSizeBytes: number;
  instructionCount: number;
  computeUnits: number;
  serializationTimeMs: number;
}

export interface ComputeEstimate {
  units: number;
  price: number;
  totalCostLamports: number;
  optimized: boolean;
}

export interface PriorityFeeResult {
  microLamports: number;
  baseFee: number;
  congestionMultiplier: number;
  urgencyMultiplier: number;
}

export interface SlippageResult {
  limitBps: number;
  adaptive: boolean;
  confidence: number;
}

export interface RouteRaceResult {
  winner: string;
  latencyMs: number;
  fillProb: number;
  expectedPnl: number;
}

export interface ExecutionMetrics {
  buildLatencyMs: number;
  serializationLatencyMs: number;
  routeLatencyMs: number;
  estimatedLandingSlot: number;
  expectedConfirmationMs: number;
  totalPlanMs: number;
}
