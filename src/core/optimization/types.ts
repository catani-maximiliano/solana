export interface CaptureBreakdown {
  expectedAlpha: number;
  capturedAlpha: number;
  slippageLoss: number;
  bundleLoss: number;
  latencyLoss: number;
  delayedEntryLoss: number;
  captureRate: number;
}

export interface RelayPerformance {
  name: string;
  latencyMs: number;
  inclusionRate: number;
  failureRate: number;
  score: number;
}

export interface ExecutionQualityScore {
  fill: number;
  slippage: number;
  latency: number;
  capture: number;
  bundleSuccess: number;
  total: number;
}

export interface PairProfitability {
  pair: string;
  totalTrades: number;
  winRate: number;
  avgReturnBps: number;
  captureRate: number;
  alphaLeakageBps: number;
  enabled: boolean;
}

export interface AdaptiveMode {
  aggressiveness: number;
  feePolicy: string;
  recommendedTiming: string;
  sendStrategy: string;
}
