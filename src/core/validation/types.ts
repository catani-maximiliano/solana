export interface EdgeAnalysis {
  detectedAlpha: number;
  capturedAlpha: number;
  leakedAlpha: number;
  captureRate: number;
  netEdge: number;
  isSignificant: boolean;
  confidence: number;
}

export interface CaptureBreakdown {
  byPair: Record<string, number>;
  byRegime: Record<string, number>;
  byRelay: Record<string, number>;
  byTiming: Record<string, number>;
}

export interface PnLDistribution {
  median: number;
  p95: number;
  p99: number;
  skew: number;
  kurtosis: number;
  tailRisk: number;
}

export interface RiskAdjustedMetrics {
  sharpeLike: number;
  captureEfficiency: number;
  drawdownAdjusted: number;
  qualityAdjusted: number;
}

export interface StatisticalSignificance {
  isSignificant: boolean;
  confidenceInterval: [number, number];
  pValue: number;
  sampleSize: number;
  stable: boolean;
}
