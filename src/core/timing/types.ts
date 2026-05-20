export type TimingDecision = "FIRE_NOW" | "WAIT_50MS" | "WAIT_100MS" | "WAIT_250MS" | "DISCARD";

export type SpreadMomentumType = "EXPANDING" | "STABLE" | "COLLAPSING";

export type ExecutionWindowType = "INSTANT" | "SHORT" | "MEDIUM" | "SLOW" | "MEAN_REVERTING" | "TOXIC_FAKE";

export interface TimingInput {
  pair: string;
  currentNetBps: number;
  spreadVelocity: number; // bps/s
  spreadAcceleration: number; // bps/s²
  ageMs: number;
  peakNetBps: number;
  lifetimeMs: number;
  takerRatio: number;
  volatilityRegime: string;
  toxicity: string;
  persistenceScore: number;
  orderbookImbalance: number;
}

export interface TimingOutput {
  decision: TimingDecision;
  recommendedDelayMs: number;
  expectedEVAtExecution: number;
  timingConfidence: number;
  windowType: ExecutionWindowType;
  spreadMomentum: SpreadMomentumType;
}

export interface TimingProfile {
  fireNowCount: number;
  wait50MsCount: number;
  wait100MsCount: number;
  wait250MsCount: number;
  discardCount: number;
  avgEVImprovement: number;
  mistimedCount: number;
}
