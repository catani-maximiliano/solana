export interface TopicConfig {
  topic: string;
  description: string;
  dex: string;
  eventType: EventKind;
  enabled: boolean;
}

export type EventKind = "SWAP" | "ROUTING" | "ORDERBOOK" | "FILL" | "TRADED" | "UNKNOWN";

export interface NormalizedRealtimeEvent {
  dex: string;
  topic: string;
  eventKind: EventKind;
  slot: number;
  signature: string;
  pool: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  amountOut: number;
  price: number;
  tick: number;
  liquidity: string;
  receivedAt: number;
  blockTime: number;
  latencyMs: number;
  raw: Record<string, any>;
}

export interface RegistryState {
  topics: TopicConfig[];
  activeStreams: number;
  totalEvents: number;
  eventsPerSec: number;
}
