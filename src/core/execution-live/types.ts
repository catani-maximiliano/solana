export interface BundleSubmission {
  id: string;
  bundleUuid: string;
  relay: string;
  sentAt: number;
  landedSlot: number;
  landed: boolean;
  included: boolean;
  latencyMs: number;
  error?: string;
}

export interface LiveTrade {
  id: string;
  pair: string;
  capitalSol: number;
  entrySlot: number;
  exitSlot: number;
  expectedProfitSol: number;
  realizedProfitSol: number;
  feesSol: number;
  slippageBps: number;
  bundleWon: boolean;
  relay: string;
  txHash: string;
  landed: boolean;
  error?: string;
  timestamp: number;
}

export interface CapitalState {
  totalCapitalSol: number;
  allocatedSol: number;
  availableSol: number;
  maxTradeSol: number;
  step: number;
}

export interface ExecutionReceipt {
  tradeId: string;
  txHash: string;
  bundleUuid: string;
  relay: string;
  slot: number;
  latencyMs: number;
  realizedProfitSol: number;
  feesSol: number;
  success: boolean;
}
