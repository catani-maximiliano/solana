import { StreamState, DexStreamHealth } from "./types";
import { logInfo, logWarning } from "../../logger";

const SILENT_THRESHOLD_MS = 5000;
const EPS_WINDOW_MS = 10000;
const MAX_TRACKED_DEXES = 10;

export class StreamHeartbeatMonitor {
  private dexes = new Map<string, DexStreamHealth>();
  private eventTimestamps = new Map<string, number[]>();
  private reconnectCallbacks: Map<string, () => void> = new Map();

  registerDex(dex: string, onReconnect?: () => void): void {
    if (this.dexes.has(dex)) return;
    this.dexes.set(dex, {
      dex,
      state: StreamState.SILENT,
      lastEventTime: 0,
      eventsPerSec: 0,
      silentDurationMs: 0,
      reconnectCount: 0,
      droppedEvents: 0,
      totalEvents: 0,
      trackedPools: 0,
      activePools: 0,
      stalePools: 0,
    });
    this.eventTimestamps.set(dex, []);
    if (onReconnect) this.reconnectCallbacks.set(dex, onReconnect);
    logInfo(`[HEARTBEAT] registered DEX: ${dex}`);
  }

  recordEvent(dex: string): void {
    const h = this.dexes.get(dex);
    if (!h) return;

    const now = Date.now();
    h.lastEventTime = now;
    h.totalEvents++;

    const timestamps = this.eventTimestamps.get(dex);
    if (timestamps) {
      timestamps.push(now);
      const cutoff = now - EPS_WINDOW_MS;
      while (timestamps.length > 0 && timestamps[0] < cutoff) timestamps.shift();
      h.eventsPerSec = timestamps.length / (EPS_WINDOW_MS / 1000);
    }

    if (h.state === StreamState.RECONNECTING || h.state === StreamState.DROPPED) {
      h.state = StreamState.ALIVE;
      logInfo(`[HEARTBEAT] ${dex} stream restored — ${h.eventsPerSec.toFixed(1)} eps`);
    } else {
      h.state = StreamState.ALIVE;
    }
  }

  recordDroppedEvent(dex: string): void {
    const h = this.dexes.get(dex);
    if (!h) return;
    h.droppedEvents++;
  }

  checkHealth(): void {
    const now = Date.now();
    for (const [, h] of this.dexes) {
      const silentMs = now - h.lastEventTime;
      h.silentDurationMs = silentMs;

      if (silentMs > SILENT_THRESHOLD_MS) {
        if (h.state !== StreamState.RECONNECTING && h.state !== StreamState.DROPPED) {
          h.state = StreamState.SILENT;
          logWarning(`[HEARTBEAT] ⚠️ ${h.dex} silent for ${(silentMs / 1000).toFixed(1)}s — pools DEAD`);
        }

        if (silentMs > SILENT_THRESHOLD_MS * 2 && h.state === StreamState.SILENT) {
          h.state = StreamState.RECONNECTING;
          h.reconnectCount++;
          logWarning(`[HEARTBEAT] reconnecting ${h.dex} stream... (attempt #${h.reconnectCount})`);

          const cb = this.reconnectCallbacks.get(h.dex);
          if (cb) {
            try { cb(); } catch { /* ignore reconnect errors */ }
          }
        }
      }
    }
  }

  getDexHealth(dex: string): DexStreamHealth | undefined {
    return this.dexes.get(dex);
  }

  getAllDexHealth(): DexStreamHealth[] {
    return Array.from(this.dexes.values());
  }

  getSilentDexes(): { dex: string; silentMs: number; reconnecting: boolean }[] {
    const result: { dex: string; silentMs: number; reconnecting: boolean }[] = [];
    for (const [, h] of this.dexes) {
      if (h.state === StreamState.SILENT || h.state === StreamState.RECONNECTING) {
        result.push({ dex: h.dex, silentMs: h.silentDurationMs, reconnecting: h.state === StreamState.RECONNECTING });
      }
    }
    return result;
  }

  isStreamAlive(dex: string): boolean {
    const h = this.dexes.get(dex);
    if (!h) return false;
    return h.state === StreamState.ALIVE;
  }

  updatePoolCounts(dex: string, tracked: number, active: number, stale: number): void {
    const h = this.dexes.get(dex);
    if (!h) return;
    h.trackedPools = tracked;
    h.activePools = active;
    h.stalePools = stale;
  }

  logHeartbeat(): void {
    for (const [, h] of this.dexes) {
      const icon = h.state === StreamState.ALIVE ? "✅"
        : h.state === StreamState.SILENT ? "⚠️"
        : h.state === StreamState.RECONNECTING ? "🔄"
        : "❌";
      logInfo(`[HEARTBEAT] ${icon} ${h.dex}: ${h.eventsPerSec.toFixed(1)} eps | silent: ${(h.silentDurationMs / 1000).toFixed(1)}s | pools: ${h.activePools}/${h.trackedPools} | drops: ${h.droppedEvents} | reconnects: ${h.reconnectCount}`);
    }
  }

  getStreamState(dex: string): StreamState {
    return this.dexes.get(dex)?.state ?? StreamState.DROPPED;
  }

  clear(): void {
    this.dexes.clear();
    this.eventTimestamps.clear();
    this.reconnectCallbacks.clear();
  }
}

export const streamHeartbeatMonitor = new StreamHeartbeatMonitor();
