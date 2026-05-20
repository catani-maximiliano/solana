export interface RawStreamEvent {
  slot: number;
  payload: string; // JSON
}

export interface NormalizedMarketEvent {
  dex: string;
  topic: string;
  slot: number;
  signature: string;
  pool: string;
  tokenA: string;
  tokenB: string;
  amountIn: number;
  amountOut: number;
  sqrtPrice: string;
  liquidity: string;
  tick: number;
  blockTime?: number;
  receivedAt: number;
  processedAt: number;
  latencyMs: number;
  freshnessMs: number;
  dedupKey: string;
}

export interface StreamSubscription {
  topic: string;
  label: string;
  connected: boolean;
  lastEventAt: number;
  totalEvents: number;
  reconnectCount: number;
}

export interface StreamHealth {
  avgLatencyMs: number;
  p50LatencyMs: number;
  p99LatencyMs: number;
  eventsPerSec: number;
  totalEvents: number;
  reconnects: number;
  stalePeriods: number;
  duplicateEvents: number;
  lastSlot: number;
  slotGaps: number;
  activeSubscriptions: number;
}
