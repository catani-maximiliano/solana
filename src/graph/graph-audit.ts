import { priceGraph, PriceEdge } from "./price-graph";
import { marketState } from "../market/state-cache";
import { logInfo, logSuccess, logWarning, logDebug } from "../logger";

interface EdgeTimeTrace {
  edgeKey: string;
  pair: string;
  dex: string;
  pool: string;
  sourceType: string;
  price: number;
  slot: number;
  timestamp: number; // when the edge was created/updated in the graph
  ageMs: number; // how long since timestamp
  receivedAt: number; // when WS/RPC data was received
  lastWsUpdate: number; // last WS update for this pool
  computedAge: number; // now - receivedAt
  valid: boolean;
}

interface FrozenPool {
  poolAddress: string;
  dex: string;
  pair: string;
  lastUpdateAge: number;
  slot: number;
  sameSlotDuration: number;
}

interface AuditReport {
  freshEdges: number;
  staleEdges: number;
  frozenPools: FrozenPool[];
  averageEdgeAge: number;
  maxEdgeAge: number;
  maxSlotDivergence: number;
  edgeTimeTraces: EdgeTimeTrace[];
  cacheReuseDetected: boolean;
}

export class GraphConsistencyAudit {
  private lastPoolSnapshots = new Map<string, { slot: number; price: number; time: number }>();
  private staleEdgeCounts = new Map<string, number>();

  /** Run a full audit of the graph's temporal consistency */
  audit(): AuditReport {
    const now = Date.now();
    const edges = priceGraph.getAllEdgesRaw();
    const edgeTimeTraces: EdgeTimeTrace[] = [];
    let freshEdges = 0;
    let staleEdges = 0;
    let totalAge = 0;
    let maxAge = 0;
    let maxSlotDivergence = 0;
    let cacheReuseDetected = false;
    const frozenPools: FrozenPool[] = [];
    const poolSlotMap = new Map<string, { slot: number; price: number; time: number }>();
    const pairSlotMap = new Map<string, number[]>();

    for (const e of edges) {
      const age = now - e.timestamp;
      const pair = `${priceGraph.mintToSymbol(e.from)}/${priceGraph.mintToSymbol(e.to)}`;

      totalAge += Math.max(0, age);
      if (age > maxAge) maxAge = age;

      // Categorize freshness
      if (age > 5000) staleEdges++;
      else freshEdges++;

      // Track per-pool slot/price for frozen detection
      const prev = this.lastPoolSnapshots.get(e.poolAddress);
      if (prev && prev.slot === e.slot && prev.price === e.price) {
        // Same slot + price — potentially frozen
        if (age > 10_000) {
          // Already logged previously
        }
      } else {
        this.lastPoolSnapshots.set(e.poolAddress, { slot: e.slot, price: e.price, time: now });
      }

      // Track slot divergence per pair
      if (e.slot > 0) {
        const slots = pairSlotMap.get(pair) || [];
        slots.push(e.slot);
        pairSlotMap.set(pair, slots);
        if (slots.length > 1) {
          const avg = slots.reduce((a, b) => a + b, 0) / slots.length;
          const div = Math.max(...slots) - Math.min(...slots);
          if (div > maxSlotDivergence) maxSlotDivergence = div;
        }
      }

      // Build time trace for this edge
      edgeTimeTraces.push({
        edgeKey: `${e.dex}:${e.poolAddress}:${e.from}:${e.to}`,
        pair,
        dex: e.dex,
        pool: e.poolAddress.substring(0, 8),
        sourceType: e.source,
        price: e.price,
        slot: e.slot,
        timestamp: e.timestamp,
        ageMs: age,
        receivedAt: (e as any).receivedAt || e.timestamp,
        lastWsUpdate: (e as any).lastWsUpdate || e.timestamp,
        computedAge: now - ((e as any).receivedAt || e.timestamp),
        valid: age < 5000 && e.health === "VALID" && e.price > 0,
      });

      // Detect cache reuse: edge created long ago but no WS updates
      if (age > 5000 && e.slot > 0) {
        const poolState = marketState.getPool(e.poolAddress);
        if (poolState) {
          const poolAge = now - poolState.timestamp;
          if (poolAge < age - 2000) {
            // Pool was updated recently but edge is old — graph reused stale data
            cacheReuseDetected = true;
            logDebug(`GraphAudit: ⚠ cache reuse ${pair} ${e.dex} ${e.poolAddress.substring(0, 8)} — edge age=${(age/1000).toFixed(0)}s pool age=${(poolAge/1000).toFixed(0)}s`);
          }
        }
      }
    }

    // Detect frozen pools: same slot for too long
    const allPools = marketState.getAllPools();
    for (const p of allPools) {
      const poolAge = now - p.timestamp;
      if (poolAge > 300_000) {
        frozenPools.push({
          poolAddress: p.poolAddress,
          dex: p.dex,
          pair: `${p.mintA.substring(0, 4)}/${p.mintB.substring(0, 4)}`,
          lastUpdateAge: poolAge,
          slot: p.slot,
          sameSlotDuration: poolAge,
        });
      }
    }

    const averageEdgeAge = edges.length > 0 ? totalAge / edges.length : 0;

    // Increment stale edge counts for logging
    for (const t of edgeTimeTraces) {
      if (t.ageMs > 5000) {
        const key = `${t.dex}:${t.pool}`;
        this.staleEdgeCounts.set(key, (this.staleEdgeCounts.get(key) || 0) + 1);
      }
    }

    return {
      freshEdges,
      staleEdges,
      frozenPools,
      averageEdgeAge,
      maxEdgeAge: maxAge,
      maxSlotDivergence,
      edgeTimeTraces: edgeTimeTraces.slice(0, 20), // top 20 for display
      cacheReuseDetected,
    };
  }

  /** Remove stale edges from the graph (age > 5000ms) */
  removeStaleEdges(): number {
    const edges = priceGraph.getAllEdgesRaw();
    let removed = 0;
    const now = Date.now();
    for (const e of edges) {
      if (now - e.timestamp > 5000 && e.health === "VALID") {
        // Downgrade to STALE instead of removing
        (e as any).health = "STALE";
        removed++;
      }
    }
    return removed;
  }

  printReport(report: AuditReport): void {
    logInfo("");
    logSuccess(`━━━━━━━━ GRAPH TIME HEALTH ──────────`);
    logInfo(`Fresh edges: ${report.freshEdges} | Stale edges: ${report.staleEdges}`);
    logInfo(`Frozen pools: ${report.frozenPools.length} | Cache reuse: ${report.cacheReuseDetected ? "YES ⚠️" : "NO ✅"}`);
    logInfo(`Avg edge age: ${(report.averageEdgeAge / 1000).toFixed(1)}s | Max edge age: ${(report.maxEdgeAge / 1000).toFixed(0)}s`);
    logInfo(`Max slot divergence: ${report.maxSlotDivergence}`);

    if (report.frozenPools.length > 0) {
      logInfo("");
      logWarning(`❄️ FROZEN POOLS:`);
      for (const f of report.frozenPools.slice(0, 5)) {
        logInfo(`  ${f.dex} ${f.poolAddress.substring(0, 8)}... (${f.pair}) — frozen ${(f.lastUpdateAge / 1000).toFixed(0)}s slot=${f.slot}`);
      }
    }

    if (report.cacheReuseDetected) {
      logInfo("");
      logWarning(`⚠️ CACHE REUSE DETECTED — graph retained stale snapshots while pool cache was fresh`);
    }

    // Show top 3 stale edge traces
    const staleTraces = report.edgeTimeTraces.filter(t => t.ageMs > 5000).slice(0, 3);
    if (staleTraces.length > 0) {
      logInfo("");
      logInfo(`TIME TRACE (top ${staleTraces.length} stale):`);
      for (const t of staleTraces) {
        logInfo(`  ${t.pair} ${t.dex} ${t.pool}...`);
        logInfo(`    Pool slot: ${t.slot} | Source: ${t.sourceType}`);
        logInfo(`    timestamp: ${t.timestamp} | ageMs: ${t.ageMs} | receivedAt: ${t.receivedAt}`);
        logInfo(`    computedAge: ${(t.computedAge / 1000).toFixed(1)}s | now: ${Date.now()}`);
      }
    }
    logSuccess(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  reset(): void {
    this.lastPoolSnapshots.clear();
    this.staleEdgeCounts.clear();
  }
}

export const graphAudit = new GraphConsistencyAudit();
