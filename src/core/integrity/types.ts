export enum PoolState {
  FRESH = "FRESH",
  STALE = "STALE",
  DEAD = "DEAD",
  CORRUPT = "CORRUPT",
}

export enum StreamState {
  ALIVE = "ALIVE",
  SILENT = "SILENT",
  RECONNECTING = "RECONNECTING",
  DROPPED = "DROPPED",
}

export interface PoolFreshness {
  poolAddress: string;
  dex: string;
  state: PoolState;
  ageMs: number;
  slot: number;
  slotDelta: number;
  price: number;
  liquidity: number;
  lastEventTime: number;
  consecutiveFailures: number;
  transitionCount: number;
  lastTransition: number;
}

export interface DexStreamHealth {
  dex: string;
  state: StreamState;
  lastEventTime: number;
  eventsPerSec: number;
  silentDurationMs: number;
  reconnectCount: number;
  droppedEvents: number;
  totalEvents: number;
  trackedPools: number;
  activePools: number;
  stalePools: number;
}

export interface ExecutionEdge {
  poolAddress: string;
  dex: string;
  from: string;
  to: string;
  price: number;
  liquidity: number;
  fee: number;
  slot: number;
  ageMs: number;
  slotDelta: number;
  sourceSlot: number;
}

export interface ExecutionGraph {
  edges: ExecutionEdge[];
  pairLabels: string[];
  nodeSymbols: string[];
  freshness: "FRESH" | "DEGRADED" | "BLOCKED";
  computedAt: number;
}

export interface DexHealthScore {
  dex: string;
  score: number;
  state: "OK" | "DEGRADED" | "DISABLED";
  freshnessRate: number;
  corruptionRate: number;
  reconnectRate: number;
  eventQuality: number;
  trackedPools: number;
  activePools: number;
}

export interface IntegrityDashboard {
  executionGraph: {
    executableEdges: number;
    staleRemoved: number;
    corruptRemoved: number;
    deadRemoved: number;
  };
  dexHealth: DexHealthScore[];
  poolStates: PoolFreshness[];
  heartbeat: {
    silentDexes: { dex: string; silentMs: number; reconnecting: boolean }[];
  };
  graphConsistency: {
    status: "OK" | "QUARANTINED" | "DEGRADED";
    quarantinedPools: string[];
    warnings: string[];
  };
  fakeAlphaProtection: "ACTIVE" | "BYPASSED";
}

export interface CorruptSnapshotReport {
  poolAddress: string;
  dex: string;
  reason: string;
  data: Record<string, unknown>;
  timestamp: number;
}

export interface ExecutionRecord {
  pair: string;
  solIn: number;
  solOut: number;
  pnlSol: number;
  success: boolean;
  txSignature?: string;
  latencyMs: number;
  alphaDetectedBps?: number;
  alphaCapturedBps?: number;
}

export interface LiveValidationStats {
  totalTrades: number;
  wins: number;
  losses: number;
  totalPnlSol: number;
  totalAlphaDetectedBps: number;
  totalAlphaCapturedBps: number;
  latencyBps: number;
  slippageBps: number;
  bundleLossBps: number;
  bundleWinCount: number;
  bundleLossCount: number;
}
