export interface ExecutableOpportunity {
  pair: string;
  symbolA: string;
  symbolB: string;
  buyPool: string;
  sellPool: string;
  buyDex: string;
  sellDex: string;
  buyPrice: number;
  sellPrice: number;
  grossSpreadBps: number;
  netSpreadBps: number;
  feesBps: number;
  slippageBps: number;
  impactBps: number;
  estimatedProfitUsd: number;
  estimatedProfitSol: number;
  totalFees: number;
  slippageCost: number;
  impactCost: number;
  executableSize: number;
  optimalSize: number;
  liquidityConfidence: number;
  confidence: number;
  latencyRisk: LatencyRisk;
  freshnessScore: number;
  persistenceMs: number;
  qualityScore: number;
  detectedAt: number;
  executionPlan?: MultiHopExecutionPlan;
}

export interface MultiHopExecutionStep {
  hopIndex: number;
  fromToken: string;
  toToken: string;
  fromSymbol: string;
  toSymbol: string;
  poolAddress: string;
  dex: string;
  inputAmount: number;
  outputAmount: number;
  feePaid: number;
  feeBps: number;
  slippageBps: number;
  priceBefore: number;
  priceAfter: number;
}

export interface MultiHopExecutionPlan {
  route: string;
  inputToken: string;
  outputToken: string;
  inputAmount: number;
  outputAmount: number;
  steps: MultiHopExecutionStep[];
  cumulativeFeeBps: number;
  cumulativeSlippageBps: number;
  netBps: number;
  profitUsd: number;
  hopCount: number;
}

export interface SurfaceReport {
  pair: string;
  symbolA: string;
  symbolB: string;
  bestBid: number;
  bestAsk: number;
  bestBidVenue: string;
  bestAskVenue: string;
  midPrice: number;
  spreadBps: number;
  executableSpreadBps: number;
  requiredGrossBps: number;
  weightedMid: number;
  pools: SurfacePoolEntry[];
  freshness: number;
  updatedAt: number;
}

export interface SurfacePoolEntry {
  poolAddress: string;
  dex: string;
  price: number;
  liquidity: number;
  fee: number;
  health: string;
  age: number;
  slot: number;
  decimalsA: number;
  decimalsB: number;
  depthProfile?: DepthProfile;
  qualityScore?: EdgeQualityScore;
}

export interface SwapSimulation {
  expectedOut: number;
  priceImpact: number;
  effectivePrice: number;
  feeCost: number;
  totalCost: number;
  executable: boolean;
  tickCrossing: boolean;
}

export interface OptimalTradeResult {
  size: number;
  netProfit: number;
  buySim: SwapSimulation;
  sellSim: SwapSimulation;
}

export interface DepthProfile {
  poolAddress: string;
  dex: string;
  price: number;
  liquidity: number;
  fee: number;
  sizes: TradeSizePoint[];
  maxExecutableSize: number;
  impactAtMax: number;
  depthScore: number;
}

export interface TradeSizePoint {
  sizeSol: number;
  priceImpact: number;
  effectivePrice: number;
  feeCost: number;
}

export interface EdgeQualityScore {
  overall: number;
  liquidity: number;
  freshness: number;
  updateCadence: number;
  volatility: number;
  stability: number;
  slippageProfile: number;
}

export interface SpreadPersistence {
  key: string;
  firstSeen: number;
  lastSeen: number;
  lifetimeMs: number;
  avgLifetimeMs: number;
  sampleCount: number;
  active: boolean;
}

export interface MicrostructureMetrics {
  edgeFreshness: number;
  updateCadence: number;
  volatility: number;
  spreadVariance: number;
  liquidityStability: number;
  marketPressure: number;
}

export type LatencyRisk = "LOW" | "MEDIUM" | "HIGH";

export function calculateLatencyRisk(ageMs: number, slotLag: number): LatencyRisk {
  if (ageMs < 2000 && slotLag < 3) return "LOW";
  if (ageMs < 5000 && slotLag < 10) return "MEDIUM";
  return "HIGH";
}

export function calculateFreshnessScore(ageMs: number, slotLag: number): number {
  const ageScore = Math.max(0, 1 - ageMs / 10_000);
  const slotScore = Math.max(0, 1 - slotLag / 20);
  return Math.min(1, (ageScore * 0.6 + slotScore * 0.4));
}

export interface TradeHop {
  fromToken: string;
  toToken: string;
  fromSymbol: string;
  toSymbol: string;
  dex: string;
  poolAddress: string;
  price: number;
  inversePrice: number;
  liquidity: number;
  feeBps: number;
  slot: number;
  age: number;
  health: string;
}

export interface TradePath {
  hops: TradeHop[];
  pathSymbols: string[];
  pathMints: string[];
  grossSpreadBps: number;
  totalFeeBps: number;
  totalSlippageBps: number;
  netSpreadBps: number;
  estimatedProfitUsd: number;
  optimalSizeSol: number;
  confidence: number;
  detectedAt: number;
  routeLabel: string;
}

export interface PathEnumerationResult {
  paths: TradePath[];
  totalExplored: number;
  cyclesFound: number;
  rejectedStale: number;
  rejectedFees: number;
  rejectedSlippage: number;
  rejectedDisconnected: number;
  rejectedDuplicate: number;
  executionTimeMs: number;
}
