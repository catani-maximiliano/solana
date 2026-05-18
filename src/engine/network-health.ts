import { priceGraph } from "../graph";
import { marketState } from "../market";
import { spreadPersistence } from "./spread-persistence";
import { executableDetector } from "./executable-detector";
import { logSuccess, logInfo } from "../logger";

export interface NetworkReport {
  nodes: number;
  edges: number;
  validEdges: number;
  pairs: number;
  pools: number;
  dexes: string[];
  nodeSymbols: string[];
  pairLabels: string[];
  edgeHealth: { valid: number; stale: number; lowLiquidity: number; invalid: number; corrupted: number };
  topLiquidityEdges: { pair: string; dex: string; liquidity: number; price: number }[];
  staleEdges: number;
  avgAgeMs: number;
  activePools: number;
  spreadPersistence: { activeSpreads: number; avgLifetimeMs: number };
  triangularCount: number;
  triangularTop: { symbols: string[]; spreadPct: number; profitUsd: number }[];
}

export function getNetworkReport(): NetworkReport {
  const nodeSymbols: string[] = [];
  for (const label of priceGraph.getPairSurfaceLabels()) {
    const [a, b] = label.split("/");
    if (!nodeSymbols.includes(a)) nodeSymbols.push(a);
    if (!nodeSymbols.includes(b)) nodeSymbols.push(b);
  }
  nodeSymbols.sort();

  const pairLabels = priceGraph.getPairSurfaceLabels();
  const dexSet = new Set<string>();
  const topLiqEdges: { pair: string; dex: string; liquidity: number; price: number }[] = [];

  for (const label of pairLabels) {
    const surface = priceGraph.getMarketSurface(label);
    if (!surface) continue;
    for (const pool of surface.pools) {
      dexSet.add(pool.dex);
      if (pool.health === "VALID" && pool.liquidity > 0) {
        topLiqEdges.push({
          pair: label,
          dex: pool.dex,
          liquidity: pool.liquidity,
          price: pool.price,
        });
      }
    }
  }

  topLiqEdges.sort((a, b) => b.liquidity - a.liquidity);

  const triOpps = priceGraph.getTriangularOpportunities();
  const pers = spreadPersistence.getStats();

  return {
    nodes: priceGraph.getNodeCount(),
    edges: priceGraph.getEdgeCount(),
    validEdges: priceGraph.getValidEdgeCount(),
    pairs: pairLabels.length,
    pools: marketState.getPoolCount(),
    dexes: Array.from(dexSet).sort(),
    nodeSymbols,
    pairLabels,
    edgeHealth: { valid: 0, stale: 0, lowLiquidity: 0, invalid: 0, corrupted: 0 },
    topLiquidityEdges: topLiqEdges.slice(0, 5),
    staleEdges: priceGraph.getEdgeCount() - priceGraph.getValidEdgeCount(),
    avgAgeMs: 0,
    activePools: priceGraph.getValidEdgeCount() > 0 ? priceGraph.getValidEdgeCount() / 2 : 0,
    spreadPersistence: {
      activeSpreads: pers.activeSpreads,
      avgLifetimeMs: pers.avgLifetimeMs,
    },
    triangularCount: triOpps.length,
    triangularTop: triOpps.slice(0, 5).map((t) => ({
      symbols: t.symbols,
      spreadPct: t.spreadPct,
      profitUsd: t.profitUsd,
    })),
  };
}

export function printNetworkReport(): void {
  const r = getNetworkReport();

  logSuccess("══════════ MARKET NETWORK ══════════");
  logInfo(`Nodes: ${r.nodes} [${r.nodeSymbols.join(", ")}]`);
  logInfo(`Edges: ${r.edges} (${r.validEdges} válidos, ${r.staleEdges} obsoletos)`);
  logInfo(`Pairs: ${r.pairs} [${r.pairLabels.join(", ")}]`);
  logInfo(`Pools: ${r.pools}`);
  logInfo(`DEXes: ${r.dexes.join(", ")}`);
  logInfo("");
  logInfo(`Active pools: ${r.activePools.toFixed(0)}`);
  logInfo(`Active spreads: ${r.spreadPersistence.activeSpreads} (avg lifetime: ${r.spreadPersistence.avgLifetimeMs.toFixed(0)}ms)`);
  logInfo("");

  if (r.topLiquidityEdges.length > 0) {
    logInfo(`Top liquidity edges:`);
    for (const e of r.topLiquidityEdges.slice(0, 5)) {
      logInfo(`  ${e.pair} | ${e.dex} | $${e.price.toFixed(6)} | liq: ${(e.liquidity / 1_000_000).toFixed(1)}M`);
    }
    logInfo("");
  }

  if (r.triangularCount > 0) {
    logInfo(`Triangular paths: ${r.triangularCount}`);
    for (const t of r.triangularTop) {
      logInfo(`  ${t.symbols.join(" → ")} | spread: ${t.spreadPct.toFixed(4)}% | profit: $${t.profitUsd.toFixed(6)}`);
    }
  } else {
    logInfo(`Triangular paths: 0 (graph incomplete for cycles)`);
  }
  logSuccess("════════════════════════════════════");
}

export const networkHealth = { getReport: getNetworkReport, printReport: printNetworkReport };
