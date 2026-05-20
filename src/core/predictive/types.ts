export interface SpreadPrediction {
  persistenceProbability: number;
  expectedSurvivalMs: number;
  decayRate: number;
  confidence: number;
}

export interface FlowPrediction {
  direction: "BUY" | "SELL" | "NEUTRAL";
  momentum: number;
  acceleration: number;
  confidence: number;
}

export interface OpportunityForecast {
  pair: string;
  currentSpread: number;
  predictedSpread: number;
  survivalProbability: number;
  windowMs: number;
  confidence: number;
}

export interface EdgeHalfLife {
  p50: number;
  p75: number;
  p95: number;
  samples: number;
}

export interface BreakoutSignal {
  probability: number;
  direction: "UP" | "DOWN" | "NEUTRAL";
  trigger: string;
  confidence: number;
}

export interface LiquidityCollapseSignal {
  probability: number;
  side: "BID" | "ASK" | "BOTH";
  severity: "LOW" | "MEDIUM" | "HIGH";
}

export interface SpreadExpansionSignal {
  expectedBps: number;
  probability: number;
  direction: "WIDEN" | "NARROW";
}

export interface VolatilityForecast {
  predicted1s: number;
  predicted5s: number;
  predicted30s: number;
  regime: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
}

export interface MomentumSignal {
  direction: "CONTINUE" | "REVERT" | "NEUTRAL";
  strength: number;
}

export interface SweepSignal {
  probability: number;
  side: "BUY" | "SELL";
  estimatedSize: number;
}

export interface AnomalySignal {
  detected: boolean;
  type: string;
  severity: number;
  description: string;
}

export interface AlphaScore {
  score: number;
  breakout: number;
  collapse: number;
  sweep: number;
  momentum: number;
  volatility: number;
  confidence: number;
}

export interface UnifiedSignal {
  pair: string;
  alpha: AlphaScore;
  breakout: BreakoutSignal;
  collapse: LiquidityCollapseSignal;
  sweep: SweepSignal;
  momentum: MomentumSignal;
  volatility: VolatilityForecast;
}
