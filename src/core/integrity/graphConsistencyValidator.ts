import { priceGraph } from "../../graph";
import { marketState } from "../../market/state-cache";
import { PoolState } from "./types";
import { poolFreshnessTracker } from "./poolFreshnessTracker";
import { logInfo, logWarning } from "../../logger";

const MAX_CROSS_DEX_DEVIATION_PCT = 5;
const MAX_QUARANTINED_POOLS = 10;
const CONSISTENCY_CHECK_INTERVAL_MS = 15000;

interface QuarantinedPool {
  poolAddress: string;
  dex: string;
  reason: string;
  quarantinedAt: number;
}

export class GraphConsistencyValidator {
  private quarantinedPools = new Map<string, QuarantinedPool>();
  private lastCheck = 0;
  private warnings: string[] = [];

  check(): { status: "OK" | "QUARANTINED" | "DEGRADED"; quarantinedPools: string[]; warnings: string[] } {
    const now = Date.now();
    if (now - this.lastCheck < CONSISTENCY_CHECK_INTERVAL_MS) {
      return this.getStatus();
    }
    this.lastCheck = now;
    this.warnings = [];
    const newlyQuarantined: string[] = [];

    this.checkCrossDexDeviation(newlyQuarantined);
    this.checkDisconnectedNodes();

    for (const addr of newlyQuarantined) {
      poolFreshnessTracker.forceMarkCorrupt(addr, "graph consistency violation");
    }

    this.releaseExpiredQuarantines();

    return this.getStatus();
  }

  private checkCrossDexDeviation(quarantined: string[]): void {
    const pairs = priceGraph.getPairSurfaceLabels();

    for (const pair of pairs) {
      const surface = priceGraph.getMarketSurface(pair);
      if (!surface || surface.validCount < 2) continue;

      const valid = surface.pools.filter((p) => p.health === "VALID" && p.price > 0);
      if (valid.length < 2) continue;

      const avgPrice = valid.reduce((s, p) => s + p.price, 0) / valid.length;

      for (const pool of valid) {
        if (avgPrice <= 0) continue;
        const deviationPct = Math.abs(pool.price - avgPrice) / avgPrice * 100;
        if (deviationPct > MAX_CROSS_DEX_DEVIATION_PCT && !this.isQuarantined(pool.poolAddress)) {
          this.warnings.push(`${pool.dex} ${pool.poolAddress.substring(0, 8)}... deviation ${deviationPct.toFixed(2)}% from avg`);
          if (this.quarantinedPools.size < MAX_QUARANTINED_POOLS) {
            this.quarantinePool(pool.poolAddress, `${pool.dex} cross-dex deviation ${deviationPct.toFixed(2)}%`);
            quarantined.push(pool.poolAddress);
          }
        }
      }
    }
  }

  private checkDisconnectedNodes(): void {
    const allEdges = priceGraph.getAllEdgesRaw();
    const connectedNodes = new Set<string>();

    for (const e of allEdges) {
      if (e.health === "VALID") {
        connectedNodes.add(e.from);
        connectedNodes.add(e.to);
      }
    }

    const allNodes = priceGraph.getNodeCount();
    const connected = connectedNodes.size;
    if (connected < allNodes && allNodes > 0) {
      this.warnings.push(`${allNodes - connected} disconnected nodes`);
    }
  }

  private quarantinePool(poolAddress: string, reason: string): void {
    if (this.isQuarantined(poolAddress)) return;
    this.quarantinedPools.set(poolAddress, {
      poolAddress,
      dex: "",
      reason,
      quarantinedAt: Date.now(),
    });
    logWarning(`[CONSISTENCY] ⛔ quarantined ${poolAddress.substring(0, 8)}... — ${reason}`);
  }

  private releaseExpiredQuarantines(): void {
    const now = Date.now();
    const QUARANTINE_TTL_MS = 60000;
    for (const [addr, q] of this.quarantinedPools) {
      if (now - q.quarantinedAt > QUARANTINE_TTL_MS) {
        this.quarantinedPools.delete(addr);
        logInfo(`[CONSISTENCY] released ${addr.substring(0, 8)}... from quarantine`);
      }
    }
  }

  isQuarantined(poolAddress: string): boolean {
    return this.quarantinedPools.has(poolAddress);
  }

  getQuarantinedPools(): QuarantinedPool[] {
    return Array.from(this.quarantinedPools.values());
  }

  private getStatus(): { status: "OK" | "QUARANTINED" | "DEGRADED"; quarantinedPools: string[]; warnings: string[] } {
    const qAddrs = Array.from(this.quarantinedPools.keys());
    const status = qAddrs.length > 3 ? "DEGRADED" : qAddrs.length > 0 ? "QUARANTINED" : "OK";
    return { status, quarantinedPools: qAddrs, warnings: [...this.warnings] };
  }

  logStatus(): void {
    const s = this.getStatus();
    logInfo(`[CONSISTENCY] graph integrity: ${s.status}`);
    for (const w of s.warnings) {
      logInfo(`  ⚠️ ${w}`);
    }
    if (s.quarantinedPools.length > 0) {
      logInfo(`  quarantined: ${s.quarantinedPools.length} pools`);
    }
  }

  clear(): void {
    this.quarantinedPools.clear();
    this.warnings = [];
    this.lastCheck = 0;
  }
}

export const graphConsistencyValidator = new GraphConsistencyValidator();
