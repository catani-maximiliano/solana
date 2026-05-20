export interface ReplayEvent {
  timestamp: number;
  type: string;
  data: any;
}

export interface ReplaySession {
  id: string;
  date: string;
  totalEvents: number;
  durationMs: number;
  events: ReplayEvent[];
}

export interface StrategyComparison {
  baselineCapture: number;
  newCapture: number;
  difference: number;
  sampleSize: number;
}

export interface LatencySensitivity {
  addedMs: number;
  captureRate: number;
  delta: number;
}
