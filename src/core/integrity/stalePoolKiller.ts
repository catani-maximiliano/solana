import { PoolState } from "./types";
import { priceGraph } from "../../graph";
import { marketState } from "../../market/state-cache";
import { poolFreshnessTracker } from "./poolFreshnessTracker";
import { executionGraphFilter } from "./executionGraphFilter";
import { logWarning, logInfo } from "../../logger";

const CHECK_INTERVAL_MS = 3000;
const MAX_CONSECUTIVE_CORRUPT = 3;

export class StalePoolKiller {
  private lastCheck = 0;
  private killCount = 0;

  check(): void {
    const now = Date.now();
    if (now - this.lastCheck < CHECK_INTERVAL_MS) return;
    this.lastCheck = now;

    const allPools = marketState.getAllPools();
    let killed = 0;

    for (const pool of allPools) {
      const ageMs = now - pool.timestamp;
      const freshness = poolFreshnessTracker.getFreshness(pool.poolAddress);

      if (!freshness) continue;

      if (freshness.state === PoolState.DEAD) {
        this.removeExecutionEdge(pool.poolAddress, `age=${(ageMs / 1000).toFixed(0)}s`);
        killed++;
        continue;
      }

      if (freshness.state === PoolState.CORRUPT) {
        if (freshness.consecutiveFailures >= MAX_CONSECUTIVE_CORRUPT) {
          this.removeExecutionEdge(pool.poolAddress, `corrupt x${freshness.consecutiveFailures}`);
          killed++;
        }
        continue;
      }

      if (freshness.state === PoolState.STALE) {
        if (ageMs > 5000) {
          poolFreshnessTracker.forceMarkDead(pool.poolAddress, `stale ${(ageMs / 1000).toFixed(0)}s`);
          killed++;
        }
        continue;
      }
    }

    if (killed > 0) {
      this.killCount += killed;
    }
  }

  private removeExecutionEdge(poolAddress: string, reason: string): void {
    logWarning(`[STALE_KILLER] removed execution edge ${poolAddress.substring(0, 8)}... — ${reason}`);
  }

  forceKillPool(poolAddress: string, reason: string): void {
    poolFreshnessTracker.forceMarkDead(poolAddress, reason);
    this.removeExecutionEdge(poolAddress, reason);
    this.killCount++;
  }

  forceKillDexPools(dex: string, reason: string): void {
    const allPools = marketState.getAllPools();
    let killed = 0;
    for (const pool of allPools) {
      if (pool.dex === dex) {
        poolFreshnessTracker.forceMarkDead(pool.poolAddress, `${dex} stream dead: ${reason}`);
        killed++;
      }
    }
    if (killed > 0) {
      this.killCount += killed;
      logWarning(`[STALE_KILLER] killed ${killed} ${dex} pools — ${reason}`);
    }
  }

  getStats(): { killCount: number; lastCheck: number } {
    return { killCount: this.killCount, lastCheck: this.lastCheck };
  }

  clear(): void {
    this.lastCheck = 0;
    this.killCount = 0;
  }
}

export const stalePoolKiller = new StalePoolKiller();
