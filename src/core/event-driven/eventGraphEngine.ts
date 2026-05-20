import { NormalizedRealtimeEvent } from "../../streams/registry/eventTypes";
import { priceGraph } from "../../graph";
import { updateEdgeFromSwap } from "./edgeUpdater";
import { logInfo, logSuccess, logWarning, logDebug } from "../../logger";

interface DexMetrics {
  totalEvents: number;
  lastEventAt: number;
  edgeUpdates: number;
  dropped: number;
  eventsPerSec: number;
}

interface GraphMetrics {
  totalUpdates: number;
  updatesPerSec: number;
  avgLatencyMs: number;
  dexMetrics: Record<string, DexMetrics>;
}

export class EventGraphEngine {
  private totalUpdates = 0;
  private updateTimestamps: number[] = [];
  private latencies: number[] = [];
  private knownPools = new Set<string>();
  private dexStats = new Map<string, DexMetrics>();

  /** Process a swap event: update the graph for the affected pool */
  processSwap(event: NormalizedRealtimeEvent): void {
    const start = performance.now();
    const dex = event.dex || "unknown";

    // Per-DEX metrics
    const stats = this.dexStats.get(dex) || { totalEvents: 0, lastEventAt: 0, edgeUpdates: 0, dropped: 0, eventsPerSec: 0 };
    stats.totalEvents++;
    stats.lastEventAt = Date.now();

    // Whirlpool-specific tracing
    if (dex === "Whirlpool") {
      logInfo(`[WHIRLPOOL EVENT] slot=${event.slot} pool=${event.pool.substring(0, 8)}... price=${event.price.toFixed(4)} amountIn=${event.amountIn} amountOut=${event.amountOut} latency=${Math.round(performance.now() - start)}ms`);
    }

    // Track pool
    this.knownPools.add(event.pool);

    // Update edge for this pool
    const updated = updateEdgeFromSwap(event);
    if (updated) {
      stats.edgeUpdates++;
      this.totalUpdates++;
      this.updateTimestamps.push(Date.now());
      if (this.updateTimestamps.length > 200) this.updateTimestamps.shift();

      const latency = Math.round(performance.now() - start);
      this.latencies.push(latency);
      if (this.latencies.length > 200) this.latencies.shift();

      if (dex === "Whirlpool") {
        logSuccess(`[WHIRLPOOL] ✅ edge updated: ${event.pool.substring(0, 8)}... price=${event.price.toFixed(6)} slot=${event.slot}`);
      }
    } else {
      stats.dropped++;
      if (dex === "Whirlpool") {
        logWarning(`[WHIRLPOOL] ⚠️ edge update FAILED: ${event.pool.substring(0, 8)}... price=${event.price}`);
      }
    }

    this.dexStats.set(dex, stats);
  }

  /** Get metrics about graph update performance */
  getMetrics(): GraphMetrics {
    const now = Date.now();
    const recent = this.updateTimestamps.filter(t => now - t < 10000);
    const eps = recent.length / 10;
    const avgLat = this.latencies.length > 0
      ? Math.round(this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length)
      : 0;

    const dexMetrics: Record<string, DexMetrics> = {};
    for (const [dex, s] of this.dexStats) {
      const dexRecent = this.updateTimestamps.filter(t => now - t < 10000).length;
      dexMetrics[dex] = {
        totalEvents: s.totalEvents,
        lastEventAt: s.lastEventAt,
        edgeUpdates: s.edgeUpdates,
        dropped: s.dropped,
        eventsPerSec: Math.round(dexRecent / 10 * 10) / 10,
      };
    }

    return { totalUpdates: this.totalUpdates, updatesPerSec: Math.round(eps * 10) / 10, avgLatencyMs: avgLat, dexMetrics };
  }

  /** Print per-DEX stream health */
  printStreamHealth(): void {
    const metrics = this.getMetrics();
    logInfo(`━━━━━━━━ [STREAM HEALTH] ──────────`);
    for (const [dex, s] of Object.entries(metrics.dexMetrics)) {
      const ago = s.lastEventAt > 0 ? ((Date.now() - s.lastEventAt) / 1000).toFixed(1) : "N/A";
      logInfo(`  ${dex.padEnd(14)} eps=${s.eventsPerSec.toFixed(1)} last=${ago}s updates=${s.edgeUpdates} dropped=${s.dropped}`);
    }
    logInfo(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  /** Get pools tracked by the event engine */
  getKnownPools(): string[] { return Array.from(this.knownPools); }

  reset(): void {
    this.totalUpdates = 0;
    this.updateTimestamps = [];
    this.latencies = [];
    this.knownPools.clear();
    this.dexStats.clear();
  }
}

export const eventGraphEngine = new EventGraphEngine();
