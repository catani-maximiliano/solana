export interface FlowWindow {
  buyVolume: number;
  sellVolume: number;
  tradeCount: number;
  buyRatio: number;
  netFlow: number;
  aggressiveBuy: number;
  aggressiveSell: number;
}

export interface WhaleAlert {
  pool: string;
  tokenIn: string;
  tokenOut: string;
  amountUsd: number;
  wallet: string;
  confidence: number;
  detectedAt: number;
}

export interface TokenMomentum {
  token: string;
  velocity: number;
  acceleration: number;
  tradeFrequency: number;
  volumeSpike: boolean;
  spreadPersistence: number;
}

export interface ToxicFlowSignal {
  pool: string;
  toxicity: "SAFE" | "RISKY" | "TOXIC";
  sandwichLikelihood: number;
  rapidInOut: boolean;
  burstVolatility: boolean;
  score: number;
}

export interface HotPool {
  pair: string;
  velocity: number;
  volumeChange: number;
  pressure: "BUY" | "SELL" | "NEUTRAL";
  toxicity: string;
  score: number;
}

export interface FlowState {
  totalSwaps: number;
  buyVolume: number;
  sellVolume: number;
  whaleAlerts: WhaleAlert[];
  toxicPools: string[];
  hotPools: HotPool[];
}
