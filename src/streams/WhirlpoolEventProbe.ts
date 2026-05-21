import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import * as path from "path";
import { logInfo, logSuccess, logWarning } from "../logger";

const API_KEY = process.env.SOLANA_API_KEY || "";
const STREAM_HOST = "events.nln.clr3.org:443";

export class WhirlpoolEventProbe {
  private client: any = null;
  private stream: any = null;

  /** Probe a single topic for inspection */
  async probe(topic: string, durationMs = 30_000): Promise<void> {
    const protoPath = path.join(__dirname, "stream_service.proto");
    const def = protoLoader.loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const pkg = grpc.loadPackageDefinition(def) as any;
    this.client = new pkg.nln.stream.v1.StreamService(STREAM_HOST, grpc.credentials.createSsl());

    const meta = new grpc.Metadata();
    meta.set("x-api-key", API_KEY);
    meta.set("x-eventstream-policy", JSON.stringify({
      version: 1,
      allowed_programs: "all",
      allowed_topics: "all",
    }));

    logSuccess(`PROBE: connecting to ${topic}...`);
    this.stream = this.client.Subscribe({ topic, format: 1 }, meta);

    let count = 0;
    const startTime = Date.now();

    return new Promise((resolve) => {
      this.stream.on("data", (msg: any) => {
        count++;
        const elapsed = Date.now() - startTime;
        const event = JSON.parse(msg.payload || "{}");
        logInfo(`━━━━━━━━ PROBE EVENT #${count} ──────────`);
        logInfo(`slot: ${msg.slot}`);
        logInfo(`signature: ${(event.signature || "N/A").substring(0, 16)}...`);
        logInfo(`pool: ${(event.pool || event.poolAddress || "N/A").substring(0, 12)}...`);
        logInfo(`tokenA: ${(event.tokenA || event.tokenMintA || event.mintA || "N/A").substring(0, 8)}...`);
        logInfo(`tokenB: ${(event.tokenB || event.tokenMintB || event.mintB || "N/A").substring(0, 8)}...`);
        logInfo(`amountIn: ${event.amountIn || event.inputAmount || "N/A"}`);
        logInfo(`amountOut: ${event.amountOut || event.outputAmount || "N/A"}`);
        logInfo(`sqrtPrice: ${(event.sqrtPrice || event.sqrtPriceX64 || "N/A").substring(0, 16)}...`);
        logInfo(`liquidity: ${(event.liquidity || "N/A").substring(0, 16)}...`);
        logInfo(`tick: ${event.tick || event.tickCurrentIndex || "N/A"}`);
        logInfo(`blockTime: ${event.blockTime || "N/A"}`);
        logInfo(`latency: ${elapsed}ms`);
        logInfo(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

        if (elapsed > durationMs) {
          logSuccess(`PROBE: ${count} events received in ${(elapsed / 1000).toFixed(0)}s`);
          this.cleanup();
          resolve();
        }
      });

      this.stream.on("error", (err: Error) => {
        logWarning(`PROBE error: ${err.message}`);
        this.cleanup();
        resolve();
      });

      this.stream.on("end", () => {
        logWarning(`PROBE ended`);
        this.cleanup();
        resolve();
      });
    });
  }

  private cleanup(): void {
    try { if (this.stream) this.stream.cancel(); } catch {}
    this.stream = null;
  }

  destroy(): void {
    this.cleanup();
  }
}

export const probe = new WhirlpoolEventProbe();
