export interface RollingMetrics {
  captureRate: number;
  sharpe: number;
  leakage: number;
  pnl: number;
  sampleSize: number;
}

export interface FeatureHistory {
  feature: string;
  roi: number[];
  sharpe: number[];
  timestamps: number[];
}

export interface LedgerEntry {
  timestamp: number;
  pair: string;
  regime: string;
  relay: string;
  detectedBps: number;
  capturedBps: number;
  latencyMs: number;
  bundleWon: boolean;
  profitSol: number;
}

export interface LongitudinalReport {
  currentCapture: RollingMetrics;
  captureTrend: "IMPROVING" | "STABLE" | "DECLINING";
  edgeDecayed: boolean;
  regimeShift: boolean;
  topRelay: string;
  topRegime: string;
}
