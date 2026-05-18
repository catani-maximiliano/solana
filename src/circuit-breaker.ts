import { logWarning, logInfo } from "./logger";

export interface CircuitBreakerState {
  consecutiveFailures: number;
  recentLatencies: number[];
  rateLimitSpikes: number;
  queueDepthPeak: number;
  degraded: boolean;
  lastEvent: string;
  lastEventTime: number;
}

export class CircuitBreaker {
  private state: CircuitBreakerState = {
    consecutiveFailures: 0,
    recentLatencies: [],
    rateLimitSpikes: 0,
    queueDepthPeak: 0,
    degraded: false,
    lastEvent: "",
    lastEventTime: 0,
  };

  private readonly FAILURE_THRESHOLD = 5;
  private readonly LATENCY_THRESHOLD_MS = 5_000;
  private readonly RATE_LIMIT_SPIKE_THRESHOLD = 3;
  private readonly QUEUE_DEPTH_THRESHOLD = 20;
  private readonly DECAY_INTERVAL_MS = 30_000;

  private decayTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.decayTimer = setInterval(() => this.decay(), this.DECAY_INTERVAL_MS);
  }

  destroy(): void {
    if (this.decayTimer) clearInterval(this.decayTimer);
  }

  recordEvent(event: "success" | "failure" | "rateLimit" | "latency" | "queueDepth"): void {
    this.state.lastEvent = event;
    this.state.lastEventTime = Date.now();

    switch (event) {
      case "success":
        this.state.consecutiveFailures = 0;
        break;
      case "failure":
        this.state.consecutiveFailures++;
        break;
      case "rateLimit":
        this.state.rateLimitSpikes++;
        this.state.consecutiveFailures++;
        break;
      case "latency":
        this.state.consecutiveFailures++;
        break;
      case "queueDepth":
        break;
    }

    this.evaluate();
  }

  recordLatency(latencyMs: number): void {
    this.state.recentLatencies.push(latencyMs);
    if (this.state.recentLatencies.length > 20) this.state.recentLatencies.shift();

    if (latencyMs > this.LATENCY_THRESHOLD_MS) {
      this.recordEvent("latency");
    }
  }

  recordQueueDepth(depth: number): void {
    if (depth > this.state.queueDepthPeak) this.state.queueDepthPeak = depth;
    if (depth > this.QUEUE_DEPTH_THRESHOLD) {
      this.recordEvent("queueDepth");
    }
  }

  private evaluate(): void {
    const wasDegraded = this.state.degraded;

    if (this.state.consecutiveFailures >= this.FAILURE_THRESHOLD) {
      this.state.degraded = true;
    }
    if (this.state.rateLimitSpikes >= this.RATE_LIMIT_SPIKE_THRESHOLD) {
      this.state.degraded = true;
    }
    if (this.state.queueDepthPeak > this.QUEUE_DEPTH_THRESHOLD) {
      this.state.degraded = true;
    }

    if (!wasDegraded && this.state.degraded) {
      logWarning(`CircuitBreaker: MODO DEGRADADO — ${this.state.consecutiveFailures} fallos consecutivos, ${this.state.rateLimitSpikes} rate limit spikes, queue peak ${this.state.queueDepthPeak}`);
    }
  }

  private decay(): void {
    if (!this.state.degraded) return;

    const oldDegraded = this.state.degraded;

    this.state.consecutiveFailures = Math.max(0, this.state.consecutiveFailures - 1);
    this.state.rateLimitSpikes = Math.max(0, this.state.rateLimitSpikes - 1);
    this.state.queueDepthPeak = Math.max(0, this.state.queueDepthPeak - 2);

    if (this.state.consecutiveFailures === 0 && this.state.rateLimitSpikes === 0) {
      this.state.degraded = false;
    }

    if (oldDegraded && !this.state.degraded) {
      logInfo(`CircuitBreaker: recuperado — modo normal restaurado`);
    }
  }

  isDegraded(): boolean {
    return this.state.degraded;
  }

  getState(): CircuitBreakerState {
    return { ...this.state };
  }

  getRecommendedInterval(baseIntervalMs: number): number {
    if (!this.state.degraded) return baseIntervalMs;
    const multiplier = Math.min(5, 1 + this.state.consecutiveFailures * 0.5);
    return Math.round(baseIntervalMs * multiplier);
  }

  getRecommendedConcurrency(base: number): number {
    if (!this.state.degraded) return base;
    return Math.max(1, Math.floor(base / 2));
  }
}

export const circuitBreaker = new CircuitBreaker();
