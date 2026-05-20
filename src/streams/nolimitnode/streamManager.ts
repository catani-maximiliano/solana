import { NlnGrpcClient, RawStreamMessage } from "./grpcClient";
import { normalizeSwapEvent } from "./normalizer";
import { nlnDedup } from "./dedup";
import { NlnStreamState, NlnHealthReport, NormalizedSwapEvent } from "./types";
import { logInfo, logSuccess, logWarning, logDebug } from "../../logger";
import { EventEmitter } from "events";

const API_KEY = process.env.SOLANA_API_KEY || "sk_live_WyFos0McoGTo53GhVpaDXqS9FYT0QuZy";
const BASE_RECONNECT_DELAY = 2000;
const STALE_THRESHOLD_MS = 15_000;

const TOPICS = [
  "solana.orca_whirlpool.swap_v2",
  "solana.orca_whirlpool.two_hop_swap_v2",
  "solana.orca_whirlpool.traded_event",
];

export class NlnStreamManager extends EventEmitter {
  private streams: Map<string, { client: NlnGrpcClient; state: NlnStreamState }> = new Map();
  private startTime = Date.now();
  private latencyWindow: number[] = [];
  private eventTimestamps: number[] = [];
  private stalePeriods = 0;

  /** Subscribe to all configured topics */
  async subscribeAll(): Promise<void> {
    for (const topic of TOPICS) {
      this.subscribeOne(topic);
    }
    logInfo(`[NLN] ${TOPICS.length} topics subscribed`);
  }

  /** Subscribe to a single topic */
  private subscribeOne(topic: string): void {
    const client = new NlnGrpcClient();
    const state: NlnStreamState = {
      topic,
      connected: false,
      lastEventAt: 0,
      totalEvents: 0,
      reconnectCount: 0,
      lastSlot: 0,
    };
    this.streams.set(topic, { client, state });
    this.connectWithRetry(topic, client, state);
  }

  /** Connect with exponential backoff */
  private connectWithRetry(topic: string, client: NlnGrpcClient, state: NlnStreamState, attempt = 0): void {
    try {
      client.connect(topic, API_KEY);
      state.connected = true;

      logSuccess(`[NLN-STREAM] connected: ${topic}`);

      client.on("event", (raw: RawStreamMessage) => {
        state.lastEventAt = Date.now();
        state.totalEvents++;
        if (raw.slot > state.lastSlot) state.lastSlot = raw.slot;

        this.processRawEvent(raw, topic);
      });

      client.on("error", (err: Error) => {
        logWarning(`[NLN] stream error [${topic}]: ${err.message}`);
        state.connected = false;
        this.scheduleReconnect(topic, client, state, attempt);
      });

      client.on("end", () => {
        logWarning(`[NLN] stream ended [${topic}]`);
        state.connected = false;
        this.scheduleReconnect(topic, client, state, attempt);
      });
    } catch (err) {
      logWarning(`[NLN] connect failed [${topic}]: ${err instanceof Error ? err.message : String(err)}`);
      this.scheduleReconnect(topic, client, state, attempt);
    }
  }

  /** Schedule reconnect with exponential backoff */
  private scheduleReconnect(topic: string, client: NlnGrpcClient, state: NlnStreamState, attempt: number): void {
    client.disconnect();
    const delay = Math.min(30_000, BASE_RECONNECT_DELAY * Math.pow(2, attempt));
    logInfo(`[NLN-RECONNECT] ${topic} in ${delay / 1000}s (attempt ${attempt + 1})`);
    state.reconnectCount++;
    setTimeout(() => this.connectWithRetry(topic, client, state, attempt + 1), delay);
  }

  /** Process a raw stream event: dedup → normalize → emit */
  private processRawEvent(raw: RawStreamMessage, topic: string): void {
    try {
      const payload = JSON.parse(raw.payload);
      const signature = payload.signature || "";
      const pool = payload.pool || payload.poolAddress || "";

      // Dedup by signature
      if (nlnDedup.isDuplicate(signature)) {
        logDebug(`[NLN-DEDUP] suppressed event ${signature.substring(0, 12)}...`);
        return;
      }

      // Ordering protection: ignore old events
      if (nlnDedup.isOldEvent(pool, raw.slot)) {
        logDebug(`[NLN] ignored old event pool=${pool.substring(0, 8)}... slot=${raw.slot}`);
        return;
      }

      // Normalize
      const normalized = normalizeSwapEvent(payload, raw.slot, topic);
      if (!normalized) {
        logDebug(`[NLN-NORMALIZER] failed to normalize event`);
        return;
      }

      // Track latency
      this.latencyWindow.push(normalized.latencyMs);
      if (this.latencyWindow.length > 200) this.latencyWindow.shift();

      this.eventTimestamps.push(Date.now());
      if (this.eventTimestamps.length > 200) this.eventTimestamps.shift();

      // Emit to internal bus
      this.emit("swap", normalized);

    } catch (err) {
      logDebug(`[NLN] process error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Check for stale streams */
  checkStale(): void {
    const now = Date.now();
    for (const [, { state }] of this.streams) {
      if (state.connected && now - state.lastEventAt > STALE_THRESHOLD_MS) {
        logWarning(`[NLN] STALE: ${state.topic} — no events for ${((now - state.lastEventAt) / 1000).toFixed(0)}s`);
        state.connected = false;
        this.stalePeriods++;
      }
    }
  }

  /** Print stream status */
  printStatus(): void {
    logInfo(`━━━━━━━━ [NLN] STREAMS ──────────`);
    for (const [topic, { state }] of this.streams) {
      const icon = state.connected ? "✅" : "⛔";
      logInfo(`  ${icon} ${topic}`);
      logInfo(`     events: ${state.totalEvents} | slot: ${state.lastSlot} | reconnects: ${state.reconnectCount}`);
    }
  }

  /** Get health report */
  getHealth(): NlnHealthReport {
    const avgLat = this.latencyWindow.length > 0
      ? Math.round(this.latencyWindow.reduce((a, b) => a + b, 0) / this.latencyWindow.length)
      : 0;
    const recent = this.eventTimestamps.filter(t => Date.now() - t < 10000);
    const eps = recent.length / 10;
    const allEvents = Array.from(this.streams.values()).reduce((s, { state }) => s + state.totalEvents, 0);
    const allReconnects = Array.from(this.streams.values()).reduce((s, { state }) => s + state.reconnectCount, 0);

    return {
      uptimeSec: Math.round((Date.now() - this.startTime) / 1000),
      streams: Array.from(this.streams.values()).map(({ state }) => state),
      totalEvents: allEvents,
      totalReconnects: allReconnects,
      stalePeriods: this.stalePeriods,
      duplicatesSuppressed: nlnDedup.duplicatesSuppressed,
      oldEventsIgnored: nlnDedup.oldEventsIgnored,
      avgLatencyMs: avgLat,
      eventsPerSec: Math.round(eps * 10) / 10,
    };
  }

  /** Print health report */
  printHealth(): void {
    const h = this.getHealth();
    logInfo(`━━━━━━━━ [NLN] HEALTH ────────────`);
    logInfo(`uptime: ${h.uptimeSec}s | events: ${h.totalEvents} | eps: ${h.eventsPerSec}`);
    logInfo(`reconnects: ${h.totalReconnects} | stale: ${h.stalePeriods}`);
    logInfo(`dup suppressed: ${h.duplicatesSuppressed} | old ignored: ${h.oldEventsIgnored}`);
    logInfo(`avg latency: ${h.avgLatencyMs}ms`);
    logInfo(`streams: ${h.streams.length} (${h.streams.filter(s => s.connected).length} connected)`);
    logInfo(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  /** Clean up all streams */
  destroy(): void {
    for (const [, { client }] of this.streams) {
      client.disconnect();
    }
    this.streams.clear();
    this.removeAllListeners();
  }
}

export const nlnStreamManager = new NlnStreamManager();
