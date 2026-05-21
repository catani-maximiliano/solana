import { ExecutionEdge, ExecutionGraph } from "./types";
import { priceGraph } from "../../graph";
import { marketState } from "../../market/state-cache";
import { PoolState } from "./types";
import { poolFreshnessTracker } from "./poolFreshnessTracker";
import { streamHeartbeatMonitor } from "./streamHeartbeatMonitor";
import { logInfo } from "../../logger";

const MAX_EXECUTION_AGE_MS = 1500;
const MAX_SLOT_DELTA = 8;

export class ExecutionGraphFilter {
  private lastExecutionEdges: ExecutionEdge[] = [];
  private lastComputedAt = 0;
  private staleRemovedCount = 0;
  private corruptRemovedCount = 0;
  private deadRemovedCount = 0;

  compute(): ExecutionGraph {
    const allEdges = priceGraph.getAllEdgesRaw();
    const now = Date.now();
    const execEdges: ExecutionEdge[] = [];
    const seenPools = new Set<string>();
    const pairSet = new Set<string>();
    const nodeSet = new Set<string>();

    for (const edge of allEdges) {
      if (edge.health !== "VALID") continue;
      if (seenPools.has(edge.poolAddress)) continue;
      seenPools.add(edge.poolAddress);

      const ageMs = now - edge.timestamp;
      const freshness = poolFreshnessTracker.getFreshness(edge.poolAddress);
      const poolState = freshness?.state ?? PoolState.DEAD;
      const slotDelta = freshness?.slotDelta ?? 999;
      const streamAlive = streamHeartbeatMonitor.isStreamAlive(edge.dex);

      if (poolState === PoolState.CORRUPT) {
        this.corruptRemovedCount++;
        continue;
      }

      if (poolState === PoolState.DEAD) {
        this.deadRemovedCount++;
        continue;
      }

      if (ageMs > MAX_EXECUTION_AGE_MS) {
        this.staleRemovedCount++;
        poolFreshnessTracker.forceMarkDead(edge.poolAddress, `age=${(ageMs / 1000).toFixed(1)}s > ${MAX_EXECUTION_AGE_MS}ms`);
        continue;
      }

      if (slotDelta > MAX_SLOT_DELTA) {
        this.staleRemovedCount++;
        continue;
      }

      if (!streamAlive) {
        this.deadRemovedCount++;
        continue;
      }

      if (edge.price <= 0 || edge.liquidity <= 0) {
        this.corruptRemovedCount++;
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

  getFreshness(): "FRESH" | "DEGRADED" | "BLOCKED" {
    if (this.lastExecutionEdges.length >= 4) return "FRESH";
    if (this.lastExecutionEdges.length > 0) return "DEGRADED";
    return "BLOCKED";
  }

  resetCounters(): void {
    this.staleRemovedCount = 0;
    this.corruptRemovedCount = 0;
    this.deadRemovedCount = 0;
  }

  getCounters(): { staleRemoved: number; corruptRemoved: number; deadRemoved: number } {
    return {
      staleRemoved: this.staleRemovedCount,
      corruptRemoved: this.corruptRemovedCount,
      deadRemoved: this.deadRemovedCount,
    };
  }

  logFilterResult(): void {
    const c = this.getCounters();
    const exec = this.lastExecutionEdges.length;
    const freshness = this.getFreshness();
    logInfo(`[EXEC_GRAPH] ${exec} executable edges | removed: ${c.staleRemoved} stale, ${c.corruptRemoved} corrupt, ${c.deadRemoved} dead | freshness=${freshness}`);
  }

  clear(): void {
    this.lastExecutionEdges = [];
    this.lastComputedAt = 0;
    this.staleRemovedCount = 0;
    this.corruptRemovedCount = 0;
    this.deadRemovedCount = 0;
  }
}

export const executionGraphFilter = new ExecutionGraphFilter();
