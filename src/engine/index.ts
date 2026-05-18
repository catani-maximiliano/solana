export { slippageEstimator, SlippageEstimator } from "./slippage-estimator";
export { surfaceEngine, MarketSurfaceEngine } from "./market-surface-engine";
export { executableDetector, ExecutableDetector } from "./executable-detector";
export type {
  ExecutableOpportunity,
  SurfaceReport,
  SurfacePoolEntry,
  SwapSimulation,
  OptimalTradeResult,
  MicrostructureMetrics,
  LatencyRisk,
} from "./types";
export {
  calculateLatencyRisk,
  calculateFreshnessScore,
} from "./types";
