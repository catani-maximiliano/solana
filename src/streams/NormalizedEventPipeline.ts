import { RawStreamEvent, NormalizedMarketEvent } from "./StreamTypes";
import { eventDeduplicator } from "./EventDeduplicator";
import { streamHealthMonitor } from "./StreamHealthMonitor";
import { logInfo, logDebug } from "../logger";

export class NormalizedEventPipeline {
  private eventQueue: NormalizedMarketEvent[] = [];
  private maxQueueSize = 1000;
  private processing = false;

  /** Normalize a raw stream event into a standard format */
  normalize(raw: RawStreamEvent, topic: string, dex: string): NormalizedMarketEvent | null {
    try {
      const data = JSON.parse(raw.payload);
      const now = Date.now();
      const blockTime = data.blockTime ? data.blockTime * 1000 : now;
      const receivedAt = now;
      const processedAt = now;
      const latencyMs = receivedAt - blockTime;
      const freshnessMs = processedAt - blockTime;

      const event: NormalizedMarketEvent = {
        dex,
        topic,
        slot: raw.slot || data.slot || 0,
        signature: data.signature || "",
        pool: data.pool || data.poolAddress || "",
        tokenA: data.tokenA || data.tokenMintA || data.mintA || "",
        tokenB: data.tokenB || data.tokenMintB || data.mintB || "",
        amountIn: Number(data.amountIn || data.inputAmount || 0),
        amountOut: Number(data.amountOut || data.outputAmount || 0),
        sqrtPrice: data.sqrtPrice || data.sqrtPriceX64 || "",
        liquidity: data.liquidity || "",
        tick: data.tick || data.tickCurrentIndex || 0,
        blockTime,
        receivedAt,
        processedAt,
        latencyMs: Math.max(0, latencyMs),
        freshnessMs: Math.max(0, freshnessMs),
        dedupKey: `${data.signature || ""}:${raw.slot}:${data.pool || data.poolAddress || ""}`,
      };

      // Dedup
      if (event.dedupKey && eventDeduplicator.isDuplicate(event.dedupKey)) {
        return null;
      }

      // Track health
      streamHealthMonitor.recordEvent(event.latencyMs, event.slot);

      return event;
    } catch (err) {
      logDebug(`EventPipeline: parse error — ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /** Queue normalized event for processing */
  enqueue(event: NormalizedMarketEvent): void {
    this.eventQueue.push(event);
    if (this.eventQueue.length > this.maxQueueSize) {
      this.eventQueue.shift();
      logDebug(`EventPipeline: queue overflow, dropping oldest event`);
    }
  }

  /** Process the event queue (runs in batches) */
  processQueue(batchSize = 10): NormalizedMarketEvent[] {
    const batch = this.eventQueue.splice(0, batchSize);
    for (const event of batch) {
      this.printEvent(event);
    }
    return batch;
  }

  /** Log a normalized event */
  private printEvent(event: NormalizedMarketEvent): void {
    logInfo(`━━━━━━━━ EVENT ──────────────`);
    logInfo(`slot: ${event.slot} | signature: ${event.signature.substring(0, 16)}...`);
    logInfo(`pool: ${event.pool.substring(0, 12)}...`);
    logInfo(`tokenA: ${event.tokenA.substring(0, 8)}... | tokenB: ${event.tokenB.substring(0, 8)}...`);
    logInfo(`amountIn: ${event.amountIn} | amountOut: ${event.amountOut}`);
    logInfo(`sqrtPrice: ${event.sqrtPrice.substring(0, 16)}... | tick: ${event.tick}`);
    logInfo(`latencyMs: ${event.latencyMs} | freshnessMs: ${event.freshnessMs}`);
    logInfo(`receivedAt: ${event.receivedAt} | processedAt: ${event.processedAt}`);
    logInfo(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  getQueueSize(): number {
    return this.eventQueue.length;
  }

  reset(): void {
    this.eventQueue = [];
  }
}

export const eventPipeline = new NormalizedEventPipeline();
