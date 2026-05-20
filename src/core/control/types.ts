export interface PipelineLatency {
  ingestionMs: number;
  routingMs: number;
  graphUpdateMs: number;
  decisionMs: number;
  timingMs: number;
  totalMs: number;
}

export interface ResourceUsage {
  cpuPercent: number;
  memoryMb: number;
  eventBacklog: number;
  processingLatencyMs: number;
}

export interface HealthStatus {
  streamsHealthy: number;
  streamsStalled: number;
  graphFrozen: boolean;
  eventLagMs: number;
  replayDivergence: boolean;
  memoryLeak: boolean;
  emergencyMode: boolean;
}

export interface LiveConfig {
  thresholds: Record<string, number>;
  weights: Record<string, number>;
  riskLimits: Record<string, number>;
  featureFlags: Record<string, boolean>;
}

export interface AuditEntry {
  timestamp: number;
  decision: "EXECUTE" | "REJECT" | "TIMEOUT" | "ERROR";
  reason: string;
  features: Record<string, number>;
  latencyMs: number;
  outcome?: string;
}
