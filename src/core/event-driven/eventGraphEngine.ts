import { NormalizedSwapEvent } from "../../streams/nolimitnode/types";
import { priceGraph } from "../../graph";
import { updateEdgeFromSwap } from "./edgeUpdater";
import { logInfo, logDebug } from "../../logger";

interface GraphMetrics {
  totalUpdates: number;
  updatesPerSec: number;
  avgLatencyMs: number;
}

export class EventGraphEngine {
  private totalUpdates = 0;
  private updateTimestamps: number[] = [];
  private latencies: number[] = [];
  private knownPools = new Set<string>();

  /** Process a swap event: update the graph for the affected pool */
  processSwap(event: NormalizedSwapEvent): void {
    const start = performance.now();

    // Track pool
    this.knownPools.add(event.pool);

    // Update edge for this pool
    const updated = updateEdgeFromSwap(event);
    if (!updated) return;

    this.totalUpdates++;
    this.updateTimestamps.push(Date.now());
    if (this.updateTimestamps.length > 200) this.updateTimestamps.shift();

    const latency = Math.round(performance.now() - start);
    this.latencies.push(latency);
    if (this.latencies.length > 200) this.latencies.shift();

    logDebug(`[EVENT-GRAPH] updated ${event.pool.substring(0, 8)}... slot=${event.slot} latency=${latency}ms`);
  }

  /** Get metrics about graph update performance */
  getMetrics(): GraphMetrics {
    const now = Date.now();
    const recent = this.updateTimestamps.filter(t => now - t < 10000);
    const eps = recent.length / 10;
    const avgLat = this.latencies.length > 0
      ? Math.round(this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length)
      : 0;

    return {
      totalUpdates: this.totalUpdates,
      updatesPerSec: Math.round(eps * 10) / 10,
      avgLatencyMs: avgLat,
    };
  }

  /** Get pools tracked by the event engine */
  getKnownPools(): string[] {
    return Array.from(this.knownPools);
  }

  reset(): void {
    this.totalUpdates = 0;
    this.updateTimestamps = [];
    this.latencies = [];
    this.knownPools.clear();
  }
}

export const eventGraphEngine = new EventGraphEngine();
