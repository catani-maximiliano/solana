export interface PipelineLatency {
  ingestMs: number;
  decodeMs: number;
  graphMs: number;
  decisionMs: number;
  bundleBuildMs: number;
  serializationMs: number;
  relaySendMs: number;
  inclusionMs: number;
  totalMs: number;
}

export interface RelayLatencySnapshot {
  region: string;
  avgLatencyMs: number;
  p50Ms: number;
  p95Ms: number;
  lastChecked: number;
}

export interface LatencySpike {
  timestamp: number;
  metric: string;
  valueMs: number;
  thresholdMs: number;
}
