export interface SwapInstruction {
  poolAddress: string;
  dex: string;
  fromMint: string;
  toMint: string;
  fromSymbol: string;
  toSymbol: string;
  inputAmount: number;
  outputAmount: number;
  minimumOutputAmount: number;
  slippageBps: number;
  feeBps: number;
}

export interface BundleTx {
  instructions: SwapInstruction[];
  computeUnits: number;
  computeUnitPrice: number; // microLamports
  tipLamports: number;
  validAges: number[];
}

export interface ExecutionPlan {
  id: string;
  route: string;
  type: "pair" | "multi_hop" | "triangular" | "latency_arb";
  inputUsd: number;
  expectedOutputUsd: number;
  profitUsd: number;
  netBps: number;
  feesBps: number;
  slippageBps: number;
  swaps: SwapInstruction[];
  priorityFeeMicroLamports: number;
  estimatedTipLamports: number;
  totalCostLamports: number;
  qualityScore: number;
  bundleReady: boolean;
  freshness: "GOOD" | "FAIR" | "STALE" | "INVALID";
  slotDelta: number;
  ageDeltaMs: number;
  confidence: number;
  crossDex: boolean;
}

export interface PriorityFeeInfo {
  microLamports: number;
  baseFee: number;
  volatilityAdjustment: number;
  competitionAdjustment: number;
}

export interface TipInfo {
  lamports: number;
  baseTip: number;
  spreadBonus: number;
  confidenceMultiplier: number;
}
