export interface PairMemory {
  pair: string;
  totalObservations: number;
  avgSurvivalMs: number;
  avgDecay: number;
  winRate: number;
  bestTiming: string;
  toxicityBias: "LOW" | "MEDIUM" | "HIGH";
  regimeMemory: Record<string, RegimeMemoryEntry>;
}

export interface RegimeMemoryEntry {
  regimeName: string;
  observations: number;
  winRate: number;
  avgReturn: number;
  bestTiming: string;
}

export interface PoolToxicityRecord {
  pool: string;
  toxicity: "LOW" | "MEDIUM" | "HIGH";
  fakeAlphaRate: number;
  survivalP50: number;
  observationCount: number;
}

export interface BotPattern {
  walletFragment: string;
  patternType: string;
  observations: number;
  confidence: number;
}

export interface ContextWindow {
  spreads1s: number[];
  spreads5s: number[];
  spreads30s: number[];
  spreads5m: number[];
  currentRegime: string;
}

export interface AdaptiveContext {
  confidenceBoost: number;
  aggressiveness: number;
  recommendedTiming: string;
  toxicityPenalty: number;
}
