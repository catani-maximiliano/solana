import { NormalizedRealtimeEvent } from "../../streams/registry/eventTypes";
import { WhaleAlert } from "./types";
import { logInfo } from "../../logger";

const WHALE_MIN_USD = 50_000;
const WHALE_SUPPRESSION_MS = 10_000;

export class WhaleDetector {
  private recentWhales = new Map<string, number>(); // wallet → timestamp

  detect(event: NormalizedRealtimeEvent): WhaleAlert | null {
    const amountUsd = Math.max(event.amountIn, event.amountOut);
    if (amountUsd < WHALE_MIN_USD || !event.signature) return null;

    const wallet = event.signature.substring(0, 16);
    const last = this.recentWhales.get(wallet);
    const now = Date.now();

    if (last && now - last < WHALE_SUPPRESSION_MS) return null; // suppress repeats
    this.recentWhales.set(wallet, now);

    const confidence = Math.min(1, amountUsd / 500_000);

    const alert: WhaleAlert = {
      pool: event.pool,
      tokenIn: event.tokenIn,
      tokenOut: event.tokenOut,
      amountUsd,
      wallet,
      confidence,
      detectedAt: now,
    };

    logInfo(`[WHALE] $${(amountUsd).toFixed(0)} on ${event.pool.substring(0, 8)}... (conf=${(confidence * 100).toFixed(0)}%)`);
    return alert;
  }

  reset(): void { this.recentWhales.clear(); }
}

export const whaleDetector = new WhaleDetector();
