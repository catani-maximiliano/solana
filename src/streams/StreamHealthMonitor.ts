import { StreamHealth } from "./StreamTypes";
import { logInfo, logWarning } from "../logger";

export class StreamHealthMonitor {
  private latencies: number[] = [];
  private eventTimestamps: number[] = [];
  public totalEvents = 0;
  public reconnects = 0;
  public stalePeriods = 0;
  public duplicateEvents = 0;
  public lastSlot = 0;
  public slotGaps = 0;
  public activeSubscriptions = 0;

  recordEvent(latencyMs: number, slot: number): void {
    this.totalEvents++;
    this.latencies.push(latencyMs);
    if (this.latencies.length > 1000) this.latencies.shift();
    this.eventTimestamps.push(Date.now());
    if (this.eventTimestamps.length > 1000) this.eventTimestamps.shift();

    if (slot > 0) {
      if (this.lastSlot > 0 && slot - this.lastSlot > 5) this.slotGaps++;
      this.lastSlot = slot;
    }
  }

  recordReconnect(): void {
    this.reconnects++;
  }

  recordStale(): void {
    this.stalePeriods++;
  }

  getHealth(): StreamHealth {
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const avg = sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;
    const p50 = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.5)] : 0;
    const p99 = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.99)] : 0;

    const now = Date.now();
    const recent = this.eventTimestamps.filter(t => now - t < 10000);
    const eps = recent.length / 10;

    return {
      avgLatencyMs: Math.round(avg),
      p50LatencyMs: p50,
      p99LatencyMs: p99,
      eventsPerSec: Math.round(eps * 10) / 10,
      totalEvents: this.totalEvents,
      reconnects: this.reconnects,
      stalePeriods: this.stalePeriods,
      duplicateEvents: this.duplicateEvents,
      lastSlot: this.lastSlot,
      slotGaps: this.slotGaps,
      activeSubscriptions: this.activeSubscriptions,
    };
  }

  printHealth(): void {
    const h = this.getHealth();
    logInfo(`━━━━━━━━ STREAM HEALTH ──────────`);
    logInfo(`Events: ${h.totalEvents} | EPS: ${h.eventsPerSec}`);
    logInfo(`Latency: avg=${h.avgLatencyMs}ms p50=${h.p50LatencyMs}ms p99=${h.p99LatencyMs}ms`);
    logInfo(`Slot: ${h.lastSlot} | Gaps: ${h.slotGaps}`);
    logInfo(`Reconnects: ${h.reconnects} | Stale: ${h.stalePeriods}`);
    logInfo(`Subscriptions: ${h.activeSubscriptions}`);
    logInfo(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  reset(): void {
    this.latencies = [];
    this.eventTimestamps = [];
    this.totalEvents = 0;
    this.reconnects = 0;
    this.stalePeriods = 0;
    this.lastSlot = 0;
    this.slotGaps = 0;
  }
}

export const streamHealthMonitor = new StreamHealthMonitor();
