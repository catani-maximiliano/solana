export interface OrderbookSnapshot {
  market: string;
  bestBid: number;
  bestAsk: number;
  spread: number;
  bidDepth: number;
  askDepth: number;
  imbalance: number;
  lastSlot: number;
  updatedAt: number;
}

export interface ImbalanceSignal {
  market: string;
  bidPressure: number;
  directionalBias: "BUY" | "SELL" | "NEUTRAL";
  magnitude: number;
  sustained: boolean;
}

export interface LiquidityShift {
  market: string;
  bidLiquidityChange: number;
  askLiquidityChange: number;
  netDirection: "BUY" | "SELL" | "NONE";
  wallDetected: boolean;
  sweepLikelihood: number;
}

export interface MakerTakerFlow {
  market: string;
  makerVolume: number;
  takerVolume: number;
  takerRatio: number;
  aggressiveBuyPct: number;
  aggressiveSellPct: number;
  absorption: boolean;
}

export interface MicrostructureSignal {
  market: string;
  liquidityPull: boolean;
  spoofLike: boolean;
  sweepProbability: number;
  breakoutProb: number;
  meanReversionProb: number;
  signalStrength: number;
}
