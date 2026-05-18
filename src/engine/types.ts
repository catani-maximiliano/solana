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
  estimatedProfitUsd: number;
  estimatedProfitSol: number;
  totalFees: number;
  slippageCost: number;
  impactCost: number;
  executableSize: number;
  optimalSize: number;
  confidence: number;
  latencyRisk: "LOW" | "MEDIUM" | "HIGH";
  freshnessScore: number;
  detectedAt: number;
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
}

export interface SwapSimulation {
  expectedOut: number;
  priceImpact: number;
  effectivePrice: number;
  feeCost: number;
  totalCost: number;
  executable: boolean;
}

export interface OptimalTradeResult {
  size: number;
  netProfit: number;
  buySim: SwapSimulation;
  sellSim: SwapSimulation;
}

export interface MicrostructureMetrics {
  edgeFreshness: number;
  updateCadence: number;
  volatility: number;
  spreadPersistence: number;
  liquidityStability: number;
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
