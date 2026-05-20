import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import * as path from "path";
import { EventEmitter } from "events";
import { TopicConfig, NormalizedRealtimeEvent } from "./eventTypes";
import { normalizeRealtimeEvent } from "./normalizedRealtimeEvent";
import { logInfo, logSuccess, logWarning } from "../../logger";

const HOST = "events.nln.clr3.org:443";
const PROTO_FILE = path.join(__dirname, "..", "stream_service.proto");

interface StreamInstance {
  topic: string;
  client: any;
  stream: any;
  connected: boolean;
  lastEventAt: number;
  totalEvents: number;
  reconnectCount: number;
}

const MAX_RECONNECT_DELAY = 30_000;
const BASE_DELAY = 2_000;

export class DynamicStreamFactory extends EventEmitter {
  private instances = new Map<string, StreamInstance>();
  private protoDef: any = null;

  private loadProtoDef(): any {
    if (this.protoDef) return this.protoDef;
    const def = protoLoader.loadSync(PROTO_FILE, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    this.protoDef = (grpc.loadPackageDefinition(def) as any).nln.stream.v1;
    return this.protoDef;
  }

  /** Create a stream for a topic */
  createStream(topicConfig: TopicConfig, apiKey: string): void {
    if (this.instances.has(topicConfig.topic)) return; // already active

    const svc = this.loadProtoDef();
    const client = new svc.StreamService(HOST, grpc.credentials.createSsl());

    const meta = new grpc.Metadata();
    meta.set("x-api-key", apiKey);
    meta.set("x-eventstream-policy", JSON.stringify({
      version: 1,
      allowed_programs: "all",
      allowed_topics: topicConfig.topic,
    }));

    const stream = client.Subscribe({ topic: topicConfig.topic, format: 1 }, meta);

    const instance: StreamInstance = {
      topic: topicConfig.topic,
      client,
      stream,
      connected: true,
      lastEventAt: Date.now(),
      totalEvents: 0,
      reconnectCount: 0,
    };

    this.instances.set(topicConfig.topic, instance);

    stream.on("data", (msg: any) => {
      instance.lastEventAt = Date.now();
      instance.totalEvents++;
      try {
        const payload = JSON.parse(msg.payload || "{}");
        const event = normalizeRealtimeEvent(payload, Number(msg.slot || 0), topicConfig);
        if (event) {
          this.emit("event", event);
        }
      } catch {}
    });

    stream.on("error", (err: Error) => {
      logWarning(`[NLN-STREAM] error [${topicConfig.topic.substring(0, 40)}...]: ${err.message}`);
      instance.connected = false;
      this.scheduleReconnect(topicConfig, instance, apiKey, 0);
    });

    stream.on("end", () => {
      instance.connected = false;
      this.scheduleReconnect(topicConfig, instance, apiKey, 0);
    });

    logSuccess(`[NLN-STREAM] connected: ${topicConfig.topic} (${topicConfig.dex}, ${topicConfig.eventType})`);
  }

  private scheduleReconnect(topicConfig: TopicConfig, instance: StreamInstance, apiKey: string, attempt: number): void {
    try { instance.stream.cancel(); } catch {}
    instance.client.close();
    const delay = Math.min(MAX_RECONNECT_DELAY, BASE_DELAY * Math.pow(2, attempt));
    logInfo(`[NLN-RECONNECT] ${topicConfig.topic.substring(0, 40)}... in ${delay / 1000}s (attempt ${attempt + 1})`);
    instance.reconnectCount++;
    setTimeout(() => {
      this.createStream(topicConfig, apiKey);
    }, delay);
  }

  /** Remove a stream */
  removeStream(topic: string): void {
    const instance = this.instances.get(topic);
    if (!instance) return;
    try { instance.stream.cancel(); } catch {}
    try { instance.client.close(); } catch {}
    this.instances.delete(topic);
    logInfo(`[NLN-STREAM] removed: ${topic}`);
  }

  /** Get stream health */
  getStreamCount(): number { return this.instances.size; }

  getTotalEvents(): number {
    return Array.from(this.instances.values()).reduce((s, i) => s + i.totalEvents, 0);
  }

  getActiveCount(): number {
    return Array.from(this.instances.values()).filter(i => i.connected).length;
  }

  destroy(): void {
    for (const [topic] of this.instances) this.removeStream(topic);
    this.removeAllListeners();
  }
}

export const streamFactory = new DynamicStreamFactory();
