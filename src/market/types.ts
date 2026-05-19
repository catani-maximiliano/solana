export type PoolType = "clmm" | "dlmm" | "constant_product" | "orderbook";

export interface PoolConfig {
  address: string;
  dex: string;
  poolType: PoolType;
  mintA: string;
  mintB: string;
  decimalsA: number;
  decimalsB: number;
  fee: number;
  tickSpacing: number;
}

export interface PriceQuote {
  inputMint: string;
  outputMint: string;
  amountIn: number;
  amountOut: number;
  priceImpactPct: number;
  routePlan: DexSwapDetail[];
  dexesUsed: string[];
  latencyMs: number;
  timestamp: number;
  contextSlot: number;
  timeTaken: number;
  source: "jupiter" | "local_simulation";
}

export interface DexSwapDetail {
  dexName: string;
  ammKey: string;
  inAmount: number;
  outAmount: number;
  feeAmount: number;
  percent: number;
  effectivePrice: number;
}

export interface QuoteRequest {
  inputMint: string;
  outputMint: string;
  amountLamports: number;
  slippageBps: number;
}

export interface LocalQuoteRequest extends QuoteRequest {
  dex?: string;
  poolAddress?: string;
}

export interface MarketDataProvider {
  readonly name: string;
  isAvailable(): boolean;
  getQuote(request: QuoteRequest): Promise<PriceQuote | null>;
}

export interface DexPoolReader {
  readonly dexName: string;
  readonly programId: string;
  readonly poolType: PoolType;
  isAvailable(): boolean;
  start(): Promise<boolean>;
  getPoolPrice(poolAddress: string): Promise<{ price: number; liquidity: number } | null>;
  getPoolConfig(poolAddress: string): Promise<PoolConfig | null>;
  getTrackedPools(): string[];
  scheduleRecovery(): void;
  destroy(): void;
}

export interface DirectPoolProvider extends DexPoolReader {
  trackPool(poolAddress: string, feeBps?: number): Promise<void>;
  attachWs(wsManager: unknown): void;
}

export const MAX_QUOTE_AGE_MS = 1500;

export function isQuoteFresh(forwardTime: number, backwardTime: number): boolean {
  return Math.abs(forwardTime - backwardTime) <= MAX_QUOTE_AGE_MS;
}

export const TOKENS: Record<string, string> = {
  SOL: "So11111111111111111111111111111111111111112",
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  JUP: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  BONK: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  WIF: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
  RAY: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
  mSOL: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
  jitoSOL: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
};

export const TOKEN_DECIMALS: Record<string, number> = {
  "So11111111111111111111111111111111111111112": 9,
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": 6,
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": 6,
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN": 6,
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": 5,
  "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm": 6,
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": 6,
  "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So": 9,
  "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn": 9,
};
