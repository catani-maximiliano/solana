export type EventType =
  | "pool:update"
  | "pool:price_change"
  | "pool:liquidity_change"
  | "spread:detected"
  | "spread:confirmed"
  | "triangular:detected"
  | "provider:status_change"
  | "provider:error"
  | "ws:connected"
  | "ws:disconnected"
  | "ws:reconnect"
  | "ws:latency_update"
  | "slot:update"
  | "error";

export interface ArbEvent {
  type: EventType;
  timestamp: number;
  data: unknown;
}

export interface PoolUpdateEvent extends ArbEvent {
  type: "pool:update";
  data: {
    poolAddress: string;
    dex: string;
    slot: number;
    sqrtPriceX64: string;
    liquidity: string;
    tick: number;
  };
}

export interface SpreadDetectedEvent extends ArbEvent {
  type: "spread:detected";
  data: {
    pair: string;
    spreadPct: number;
    profitUsd: number;
    forwardDex: string;
    backwardDex: string;
    confidence: number;
  };
}

export interface TriangularDetectedEvent extends ArbEvent {
  type: "triangular:detected";
  data: {
    route: string[];
    tokens: string[];
    spreadPct: number;
    profitUsd: number;
    hops: number;
  };
}

export interface ProviderStatusEvent extends ArbEvent {
  type: "provider:status_change";
  data: {
    provider: string;
    available: boolean;
    reason?: string;
  };
}
