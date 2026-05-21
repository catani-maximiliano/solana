import { ExecutionEdge, ExecutionGraph } from "./types";
import { priceGraph } from "../../graph";
import { marketState } from "../../market/state-cache";
import { PoolState } from "./types";
import { poolFreshnessTracker } from "./poolFreshnessTracker";
import { streamHeartbeatMonitor } from "./streamHeartbeatMonitor";
import { dexHealthMonitor } from "./dexHealthMonitor";
import { logInfo, logWarning } from "../../logger";

const MAX_EXECUTION_AGE_MS = 1500;
const MAX_SLOT_DELTA = 8;

export class ExecutionGraphBuilder {
  private lastExecutionEdges: ExecutionEdge[] = [];
  private lastComputedAt = 0;
  private rejectCounts = { stale: 0, slot: 0, sameDex: 0, invalidPrice: 0, dexDisabled: 0, corrupt: 0, dead: 0 };

  compute(): ExecutionGraph {
    const allEdges = priceGraph.getAllEdgesRaw();
    const now = Date.now();
    const execEdges: ExecutionEdge[] = [];
    const seenPools = new Set<string>();
    const pairSet = new Set<string>();
    const nodeSet = new Set<string>();
    const counters = { stale: 0, slot: 0, sameDex: 0, invalidPrice: 0, dexDisabled: 0, corrupt: 0, dead: 0 };

    for (const edge of allEdges) {
      if (edge.health !== "VALID") { counters.stale++; continue; }
      if (seenPools.has(edge.poolAddress)) continue;
      seenPools.add(edge.poolAddress);

      const ageMs = now - edge.timestamp;
      const freshness = poolFreshnessTracker.getFreshness(edge.poolAddress);
      const poolState = freshness?.state ?? PoolState.DEAD;
      const slotDelta = freshness?.slotDelta ?? 0;

      // Early rejection: CORRUPT
      if (poolState === PoolState.CORRUPT) {
        counters.corrupt++;
        logInfo(`[EXEC_GRAPH] REJECT ${edge.dex} ${edge.poolAddress.substring(0, 8)}... CORRUPT`);
        continue;
      }

      // Early rejection: DEAD
      if (poolState === PoolState.DEAD) {
        counters.dead++;
        logInfo(`[EXEC_GRAPH] REJECT ${edge.dex} ${edge.poolAddress.substring(0, 8)}... DEAD`);
        continue;
      }

      // Early rejection: age > 1.5s
      if (ageMs > MAX_EXECUTION_AGE_MS) {
        counters.stale++;
        logInfo(`[EXEC_GRAPH] REJECT ${edge.dex} ${edge.poolAddress.substring(0, 8)}... STALE age=${(ageMs / 1000).toFixed(1)}s`);
        poolFreshnessTracker.forceMarkDead(edge.poolAddress, `age ${(ageMs / 1000).toFixed(1)}s > 1.5s`);
        continue;
      }

      // Early rejection: slotΔ > 8
      if (slotDelta > MAX_SLOT_DELTA) {
        counters.slot++;
        logInfo(`[EXEC_GRAPH] REJECT ${edge.dex} ${edge.poolAddress.substring(0, 8)}... slotΔ=${slotDelta} > 8`);
        continue;
      }

      // Early rejection: DEX disabled
      if (!dexHealthMonitor.isDexEnabled(edge.dex)) {
        counters.dexDisabled++;
        continue;
      }

      // Early rejection: invalid price/liquidity
      if (edge.price <= 0 || edge.liquidity <= 0 || !isFinite(edge.price)) {
        counters.invalidPrice++;
        poolFreshnessTracker.forceMarkCorrupt(edge.poolAddress, `price=${edge.price} liq=${edge.liquidity}`);
        continue;
      }

      const pool = marketState.getPool(edge.poolAddress);
      const sourceSlot = pool?.slot ?? 0;

      execEdges.push({
        poolAddress: edge.poolAddress,
        dex: edge.dex,
        from: edge.from,
        to: edge.to,
        price: edge.price,
        liquidity: edge.liquidity,
        fee: edge.fee,
        slot: edge.slot,
        ageMs,
        slotDelta,
        sourceSlot,
      });

      const symFrom = priceGraph.mintToSymbol(edge.from);
      const symTo = priceGraph.mintToSymbol(edge.to);
      pairSet.add(`${symFrom}/${symTo}`);
      nodeSet.add(symFrom);
      nodeSet.add(symTo);
    }

    this.lastExecutionEdges = execEdges;
    this.lastComputedAt = now;
    this.rejectCounts = counters;

    const freshness: "FRESH" | "DEGRADED" | "BLOCKED" =
      execEdges.length >= 4 ? "FRESH"
      : execEdges.length > 0 ? "DEGRADED"
      : "BLOCKED";

    return {
      edges: execEdges,
      pairLabels: Array.from(pairSet),
      nodeSymbols: Array.from(nodeSet),
      freshness,
      computedAt: now,
    };
  }

  getExecutionEdgeCount(): number {
    return this.lastExecutionEdges.length;
  }

  getExecutionEdges(): ExecutionEdge[] {
    return [...this.lastExecutionEdges];
  }

  hasExecutionEdge(poolAddress: string): boolean {
    return this.lastExecutionEdges.some((e) => e.poolAddress === poolAddress);
  }

  getExecutionEdgesForPair(from: string, to: string): ExecutionEdge[] {
    return this.lastExecutionEdges.filter((e) => e.from === from && e.to === to);
  }

  getPairLabels(): string[] {
    const pairs = new Set<string>();
    for (const e of this.lastExecutionEdges) {
      pairs.add(`${priceGraph.mintToSymbol(e.from)}/${priceGraph.mintToSymbol(e.to)}`);
    }
    return Array.from(pairs);
  }

  getFreshness(): "FRESH" | "DEGRADED" | "BLOCKED" {
    if (this.lastExecutionEdges.length >= 4) return "FRESH";
    if (this.lastExecutionEdges.length > 0) return "DEGRADED";
    return "BLOCKED";
  }

  getRejectCounts() {
    return { ...this.rejectCounts };
  }

  resetCounters(): void {
    this.rejectCounts = { stale: 0, slot: 0, sameDex: 0, invalidPrice: 0, dexDisabled: 0, corrupt: 0, dead: 0 };
  }

  clear(): void {
    this.lastExecutionEdges = [];
    this.lastComputedAt = 0;
    this.resetCounters();
  }
}

export const executionGraphBuilder = new ExecutionGraphBuilder();
