export interface CriticalPathMetrics {
  decodeMs: number;
  graphMs: number;
  decisionMs: number;
  buildMs: number;
  serializeMs: number;
  totalMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

export interface GCPressure {
  youngGcMs: number;
  oldGcMs: number;
  allocationRateMBs: number;
  pressure: "LOW" | "MEDIUM" | "HIGH";
}

export interface EventLoopJitter {
  avgJitterMs: number;
  maxJitterMs: number;
  slowTickCount: number;
}
