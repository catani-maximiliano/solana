import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import * as path from "path";
import { EventEmitter } from "events";

const HOST = "events.nln.clr3.org:443";
const PROTO_FILE = path.join(__dirname, "..", "stream_service.proto");

export interface RawStreamMessage {
  slot: number;
  payload: string;
}

export class NlnGrpcClient extends EventEmitter {
  private client: any = null;
  private stream: any = null;

  /** Connect to a topic stream */
  connect(topic: string, apiKey: string): void {
    const def = protoLoader.loadSync(PROTO_FILE, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const pkg = (grpc.loadPackageDefinition(def) as any).nln.stream.v1;
    this.client = new pkg.StreamService(HOST, grpc.credentials.createSsl());

    const meta = new grpc.Metadata();
    meta.set("x-api-key", apiKey);
    meta.set("x-eventstream-policy", JSON.stringify({
      version: 1,
      allowed_programs: "orca_whirlpool",
      allowed_topics: topic,
    }));

    this.stream = this.client.Subscribe({ topic, format: 1 }, meta);

    this.stream.on("data", (msg: any) => {
      const raw: RawStreamMessage = {
        slot: Number(msg.slot || 0),
        payload: msg.payload || "{}",
      };
      this.emit("event", raw);
    });

    this.stream.on("error", (err: Error) => {
      this.emit("error", err);
    });

    this.stream.on("end", () => {
      this.emit("end");
    });
  }

  /** Disconnect from stream */
  disconnect(): void {
    try { if (this.stream) this.stream.cancel(); } catch {}
    this.stream = null;
    this.client = null;
  }
}
