import { NormalizedSwapEvent } from "../../streams/nolimitnode/types";

export interface LiveEdge {
  pool: string;
  dex: string;
  tokenA: string;
  tokenB: string;
  price: number;
  slot: number;
  lastUpdate: number;
  updateCount: number;
  liquidity: string;
}

export interface LivePair {
  pair: string; // canonical label
  edges: LiveEdge[];
  bestBid: LiveEdge | null;
  bestAsk: LiveEdge | null;
  spreadBps: number;
  lastUpdate: number;
}

export interface EventCandidate {
  id: string;
  pair: string;
  route: string;
  type: "pair" | "multi_hop";
  grossBps: number;
  netBps: number;
  feesBps: number;
  slippageBps: number;
  confidence: number;
  expectedProfitUsd: number;
  sourceSlot: number;
  detectedAt: number;
  triggerEvent: string;
}
