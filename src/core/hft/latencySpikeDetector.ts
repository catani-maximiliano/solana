import { LatencySpike } from "./types";
import { logWarning } from "../../logger";

export class LatencySpikeDetector {
  private spikes: LatencySpike[] = [];
  private readonly thresholds: Record<string, number> = {
    ingest: 5, decode: 2, graph: 3, decision: 3, build: 2, serialization: 2, relay: 50,
  };
  private lastValues: Record<string, number> = {};

  record(metric: string, valueMs: number): void {
    this.lastValues[metric] = valueMs;
    const threshold = this.thresholds[metric];
    if (!threshold) return;
    if (valueMs > threshold) {
      this.spikes.push({ timestamp: Date.now(), metric, valueMs, thresholdMs: threshold });
      logWarning(`[HFT] ⚡ Latency spike: ${metric}=${valueMs.toFixed(1)}ms (threshold ${threshold}ms)`);
    }
  }

  getRecentSpikes(n = 10): LatencySpike[] { return this.spikes.slice(-n); }

  getSpikeCount(): number { return this.spikes.length; }

  reset(): void { this.spikes = []; }
}

export const latencySpikeDetector = new LatencySpikeDetector();
