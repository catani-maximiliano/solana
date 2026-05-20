export type ShadowOutcome = "WIN" | "PARTIAL_WIN" | "FLAT" | "LOSS" | "FALSE_POSITIVE" | "MISSED_ALPHA";
export type TimingComparison = "FIRE_NOW" | "WAIT_50MS" | "WAIT_100MS" | "WAIT_250MS";

export interface ShadowExecution {
  pair: string;
  timestamp: number;
  slot: number;
  expectedNetBps: number;
  realizedNetBps: number;
  capturedNetBps: number;
  expectedProfitUsd: number;
  realizedProfitUsd: number;
  timingDecision: TimingComparison;
  outcome: ShadowOutcome;
  latencyMs: number;
  features: Record<string, number>;
}

export interface LatencyReplayResult {
  at10ms: number;
  at25ms: number;
  at50ms: number;
  leakageBps: number;
}

export interface StrategyEvaluation {
  strategy: string;
  winRate: number;
  avgReturn: number;
  falsePositiveRate: number;
  sampleCount: number;
}
