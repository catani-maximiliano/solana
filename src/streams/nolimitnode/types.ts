export interface DecodedSwapPayload {
  signature: string;
  slot: number;
  pool: string;
  tokenIn?: string;
  tokenOut?: string;
  mintA?: string;
  mintB?: string;
  tokenA?: string;
  tokenB?: string;
  amountIn?: number | string;
  amountOut?: number | string;
  inputAmount?: number | string;
  outputAmount?: number | string;
  sqrtPrice?: string;
  sqrtPriceX64?: string;
  liquidity?: string;
  tick?: number;
  tickCurrentIndex?: number;
  blockTime?: number;
}

export interface NormalizedSwapEvent {
  dex: "Whirlpool";
  streamTopic: string;
  slot: number;
  signature: string;
  pool: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  amountOut: number;
  priceBefore: number;
  priceAfter: number;
  tick: number;
  liquidity: string;
  receivedAt: number;
  blockTime: number;
  latencyMs: number;
}

export interface NlnStreamState {
  topic: string;
  connected: boolean;
  lastEventAt: number;
  totalEvents: number;
  reconnectCount: number;
  lastSlot: number;
}

export interface NlnHealthReport {
  uptimeSec: number;
  streams: NlnStreamState[];
  totalEvents: number;
  totalReconnects: number;
  stalePeriods: number;
  duplicatesSuppressed: number;
  oldEventsIgnored: number;
  avgLatencyMs: number;
  eventsPerSec: number;
}
