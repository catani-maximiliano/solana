export interface LiveTradeRecord {
  id: string;
  pair: string;
  route: string;
  entrySlot: number;
  entryPrice: number;
  exitSlot: number;
  exitPrice: number;
  expectedNetBps: number;
  realizedNetBps: number;
  expectedSlippageBps: number;
  realizedSlippageBps: number;
  capitalUsd: number;
  profitUsd: number;
  landed: boolean;
  landedLate: boolean;
  partialFill: boolean;
  bundleWon: boolean;
  failureReason?: string;
  timestamp: number;
}

export interface LiveExecutionGuardResult {
  allowed: boolean;
  reason: string;
  riskScore: number;
}

export interface CapitalAllocation {
  maxTradeUsd: number;
  maxExposureUsd: number;
  maxConcurrentTrades: number;
  currentExposureUsd: number;
}

export interface RiskLimits {
  maxDailyLossUsd: number;
  maxConsecutiveLosses: number;
  maxLeakageBps: number;
  emergencyStop: boolean;
}

export interface RealFillInfo {
  fillPct: number;
  landed: boolean;
  landedLate: boolean;
  partial: boolean;
  slotLanded: number;
  latencyMs: number;
}

export interface RealSlippageInfo {
  expectedBps: number;
  realizedBps: number;
  leakageBps: number;
}

export interface LiveStats {
  totalTrades: number;
  winRate: number;
  captureRate: number;
  avgSlippageLeakage: number;
  bundlesWon: number;
  bundlesLost: number;
  pnlUsd: number;
  emergencyStop: boolean;
}
