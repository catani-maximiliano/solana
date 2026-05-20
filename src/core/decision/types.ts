export interface DecisionCandidate {
  pair: string;
  route: string;
  score: number;
  confidence: number;
  expectedValue: number;
  survivalMs: number;
  fillProbability: number;
  toxicity: "SAFE" | "RISKY" | "TOXIC";
  executionPriority: number;
  shouldExecute: boolean;
}

export interface ToxicityReport {
  level: "SAFE" | "RISKY" | "TOXIC";
  sandwichRisk: number;
  spoofRisk: number;
  burstRisk: number;
  score: number;
}

export interface SurvivalEstimate {
  expectedMs: number;
  p50: number;
  p95: number;
  decayRate: number;
}

export interface ExpectedValue {
  gross: number;
  fees: number;
  slippage: number;
  decay: number;
  toxicityPenalty: number;
  net: number;
}

export interface RiskAssessment {
  overall: "LOW" | "MEDIUM" | "HIGH";
  latencyRisk: number;
  competitionRisk: number;
  liquidityRisk: number;
  toxicityRisk: number;
}

export interface ConfidenceBreakdown {
  flow: number;
  orderbook: number;
  persistence: number;
  volatility: number;
  whalePresence: number;
  overall: number;
}

export interface ExecutionProfile {
  detectionLatencyMs: number;
  decisionLatencyMs: number;
  totalInternalLatencyMs: number;
}
