import { PoolState } from "./types";
import { poolFreshnessTracker } from "./poolFreshnessTracker";
import { dexHealthMonitor } from "./dexHealthMonitor";
import { executionGraphBuilder } from "./executionGraphFilter";
import { logInfo } from "../../logger";

const MAX_AGE_MS = 1500;
const MAX_SLOT_DELTA = 8;

export class ConfidenceSanitizer {
  sanitize(
    poolAddress: string,
    dex: string,
    ageMs: number,
    slotDelta: number,
  ): { confidence: number; reason?: string } {
    const freshness = poolFreshnessTracker.getFreshness(poolAddress);
    const poolState = freshness?.state ?? PoolState.DEAD;

    if (poolState === PoolState.CORRUPT) {
      logInfo(`[CONFIDENCE] ZERO ${poolAddress.substring(0, 8)}... CORRUPT`);
      return { confidence: 0, reason: "CORRUPT" };
    }

    if (poolState === PoolState.DEAD) {
      logInfo(`[CONFIDENCE] ZERO ${poolAddress.substring(0, 8)}... DEAD`);
      return { confidence: 0, reason: "DEAD" };
    }

    if (poolState === PoolState.STALE) {
      logInfo(`[CONFIDENCE] ZERO ${poolAddress.substring(0, 8)}... STALE`);
      return { confidence: 0, reason: "STALE" };
    }

    if (ageMs > MAX_AGE_MS) {
      logInfo(`[CONFIDENCE] ZERO ${poolAddress.substring(0, 8)}... age=${(ageMs / 1000).toFixed(1)}s > ${MAX_AGE_MS}ms`);
      return { confidence: 0, reason: `age ${(ageMs / 1000).toFixed(1)}s > ${MAX_AGE_MS}ms` };
    }

    if (slotDelta > MAX_SLOT_DELTA) {
      logInfo(`[CONFIDENCE] ZERO ${poolAddress.substring(0, 8)}... slotΔ=${slotDelta} > ${MAX_SLOT_DELTA}`);
      return { confidence: 0, reason: `slotΔ=${slotDelta} > ${MAX_SLOT_DELTA}` };
    }

    if (!dexHealthMonitor.isDexEnabled(dex)) {
      logInfo(`[CONFIDENCE] ZERO ${poolAddress.substring(0, 8)}... dex ${dex} DISABLED`);
      return { confidence: 0, reason: `dex ${dex} DISABLED` };
    }

    if (!executionGraphBuilder.hasExecutionEdge(poolAddress)) {
      logInfo(`[CONFIDENCE] ZERO ${poolAddress.substring(0, 8)}... not in execution graph`);
      return { confidence: 0, reason: "not in execution graph" };
    }

    return { confidence: 1 };
  }

  sanitizePair(
    poolA: { address: string; dex: string; age: number; slotDelta: number },
    poolB: { address: string; dex: string; age: number; slotDelta: number },
  ): { valid: boolean; reasons: string[] } {
    const reasons: string[] = [];
    const a = this.sanitize(poolA.address, poolA.dex, poolA.age, poolA.slotDelta);
    if (a.confidence === 0) reasons.push(`poolA: ${a.reason}`);
    const b = this.sanitize(poolB.address, poolB.dex, poolB.age, poolB.slotDelta);
    if (b.confidence === 0) reasons.push(`poolB: ${b.reason}`);

    if (reasons.length > 0) {
      logInfo(`[CONFIDENCE] PAIR INVALID: ${reasons.join("; ")}`);
    }
    return { valid: reasons.length === 0, reasons };
  }
}

export const confidenceSanitizer = new ConfidenceSanitizer();
