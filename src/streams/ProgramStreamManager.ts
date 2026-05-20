import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import * as path from "path";
import { RawStreamEvent, StreamSubscription } from "./StreamTypes";
import { eventPipeline } from "./NormalizedEventPipeline";
import { streamHealthMonitor } from "./StreamHealthMonitor";
import { logInfo, logWarning, logSuccess, logDebug } from "../logger";

const STREAM_HOST = "events.nln.clr3.org:443";
const API_KEY = process.env.SOLANA_API_KEY || "sk_live_WyFos0McoGTo53GhVpaDXqS9FYT0QuZy";

interface TopicConfig {
  topic: string;
  label: string;
  dex: string;
}

const TOPICS: TopicConfig[] = [
  { topic: "solana.orca_whirlpool.traded_event", label: "Orca Whirlpool Traded", dex: "Whirlpool" },
  { topic: "solana.orca_whirlpool.swap", label: "Orca Whirlpool Swap", dex: "Whirlpool" },
  { topic: "solana.orca_whirlpool.swap_v2", label: "Orca Whirlpool Swap V2", dex: "Whirlpool" },
  { topic: "solana.orca_whirlpool.two_hop_swap", label: "Orca 2-Hop Swap", dex: "Whirlpool" },
  { topic: "solana.orca_whirlpool.two_hop_swap_v2", label: "Orca 2-Hop Swap V2", dex: "Whirlpool" },
];

export class ProgramStreamManager {
  private client: any = null;
  private subscriptions: StreamSubscription[] = [];
  private streams: any[] = [];
  private protoPath = "";
  private reconnectTimers: any[] = [];

  constructor() {
    this.protoPath = path.join(__dirname, "stream_service.proto");
  }

  /** Load proto and create gRPC client */
  private getClient(): any {
    if (this.client) return this.client;
    const def = protoLoader.loadSync(this.protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const pkg = grpc.loadPackageDefinition(def) as any;
    this.client = new pkg.nln.stream.v1.StreamService(
      STREAM_HOST,
      grpc.credentials.createSsl(),
    );
    return this.client;
  }

  /** Subscribe to all configured topics */
  async subscribeAll(): Promise<void> {
    for (const cfg of TOPICS) {
      await this.subscribeOne(cfg);
    }
    logInfo(`ProgramStreamManager: ${this.subscriptions.length} topics subscribed`);
  }

  /** Subscribe to a single topic */
  private subscribeOne(cfg: TopicConfig): Promise<void> {
    return new Promise((resolve) => {
      try {
        const client = this.getClient();
        const meta = new grpc.Metadata();
        meta.set("x-api-key", API_KEY);
        meta.set("x-eventstream-policy", JSON.stringify({
          version: 1,
          allowed_programs: "all",
          allowed_topics: "all",
        }));

        const stream = client.Subscribe({ topic: cfg.topic, format: 1 }, meta);

        const sub: StreamSubscription = {
          topic: cfg.topic,
          label: cfg.label,
          connected: true,
          lastEventAt: Date.now(),
          totalEvents: 0,
          reconnectCount: 0,
        };
        this.subscriptions.push(sub);

        stream.on("data", (msg: any) => {
          sub.lastEventAt = Date.now();
          sub.totalEvents++;
          const raw: RawStreamEvent = {
            slot: Number(msg.slot || 0),
            payload: msg.payload || "{}",
          };
          const event = eventPipeline.normalize(raw, cfg.topic, cfg.dex);
          if (event) {
            eventPipeline.enqueue(event);
          }
        });

        stream.on("error", (err: Error) => {
          logWarning(`Stream error [${cfg.label}]: ${err.message}`);
          sub.connected = false;
          this.scheduleReconnect(cfg, sub);
          resolve();
        });

        stream.on("end", () => {
          logWarning(`Stream ended [${cfg.label}]`);
          sub.connected = false;
          this.scheduleReconnect(cfg, sub);
          resolve();
        });

        this.streams.push(stream);
        logSuccess(`STREAM_CONNECTED: ${cfg.topic}`);
        resolve();
      } catch (err) {
        logWarning(`Stream subscribe failed [${cfg.label}]: ${err instanceof Error ? err.message : String(err)}`);
        this.scheduleReconnect(cfg, null);
        resolve();
      }
    });
  }

  /** Reconnect a stream after disconnection */
  private scheduleReconnect(cfg: TopicConfig, sub: StreamSubscription | null): void {
    const delay = 5000;
    logInfo(`Stream reconnect in ${delay / 1000}s [${cfg.label}]`);
    const timer = setTimeout(async () => {
      await this.subscribeOne(cfg);
      if (sub) sub.reconnectCount++;
      streamHealthMonitor.recordReconnect();
      logSuccess(`STREAM_RECONNECTED: ${cfg.topic} (reconnect #${sub?.reconnectCount || 0})`);
    }, delay);
    this.reconnectTimers.push(timer);
  }

  /** Check for stale streams */
  checkStale(timeoutMs = 15_000): void {
    const now = Date.now();
    for (const sub of this.subscriptions) {
      const age = now - sub.lastEventAt;
      if (age > timeoutMs && sub.connected) {
        logWarning(`STREAM_STALE: ${sub.label} — no events for ${(age / 1000).toFixed(0)}s`);
        sub.connected = false;
        streamHealthMonitor.recordStale();
      }
    }
  }

  /** Print active subscriptions */
  printStatus(): void {
    logInfo(`━━━━━━━━ STREAM SUBSCRIPTIONS ──────────`);
    for (const sub of this.subscriptions) {
      const icon = sub.connected ? "✅" : "⏸";
      logInfo(`  ${icon} ${sub.label}: ${sub.totalEvents} events (${sub.reconnectCount} reconnects)`);
    }
    logInfo(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  /** Process queued events */
  processEvents(): void {
    eventPipeline.processQueue(20);
  }

  destroy(): void {
    for (const s of this.streams) {
      try { s.cancel(); } catch {}
    }
    for (const t of this.reconnectTimers) {
      clearTimeout(t);
    }
    this.streams = [];
    this.subscriptions = [];
    this.reconnectTimers = [];
  }
}

export const programStreamManager = new ProgramStreamManager();
