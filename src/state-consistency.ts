import { logWarning, logSuccess } from "./logger";
import { MarketStateCache } from "./market/state-cache";
import { PriceGraph } from "./graph/price-graph";
import { POOL_REGISTRY } from "./config/pools";

export interface ConsistencyReport {
  pools: number;
  pairs: number;
  graphEdges: number;
  graphNodes: number;
  registrySize: number;
  warnings: string[];
  passed: boolean;
}

export class StateConsistencyValidator {
  private lastReport: ConsistencyReport | null = null;
  private consistentCount = 0;
  private inconsistentCount = 0;

  check(stateCache: MarketStateCache, graph: PriceGraph): ConsistencyReport {
    const warnings: string[] = [];

    const poolCount = stateCache.getPoolCount();
    const pairCount = stateCache.getPairCount();
    const stats = stateCache.getStats();
    const registrySize = POOL_REGISTRY.length;

    const graphNodes = graph.getNodeCount();
    const graphEdges = graph.getEdgeCount();

    if (poolCount > 0 && pairCount === 0) {
      warnings.push(`INCONSISTENCIA: ${poolCount} pool(s) pero 0 pares — buildPairLabel no reconoce mints`);
    }

    if (pairCount > 0 && graphEdges === 0) {
      warnings.push(`INCONSISTENCIA: ${pairCount} pair(s) pero 0 graph edges — updateFromPool no fue llamado`);
    }

    if (pairCount > 0 && graphNodes < 2) {
      warnings.push(`INCONSISTENCIA: ${pairCount} pair(s) pero <2 graph nodes (${graphNodes}) — graph no inicializado`);
    }

    if (poolCount === 0 && registrySize > 0) {
      warnings.push(`INCONSISTENCIA: registry tiene ${registrySize} pool(s) pero cache tiene 0 — sin updates WS`);
    }

    for (const pair of stats.pairDetails) {
      if (pair.price === 0 && pair.updates > 0) {
        warnings.push(`PRICE ZERO: pair ${pair.label} tiene ${pair.updates} updates pero price=0`);
      }
    }

    if (graphEdges > 0 && pairCount === 0) {
      warnings.push(`GRAPH ORPHAN: ${graphEdges} edges pero 0 pairs — graph no sincronizado con cache`);
    }

    const passed = warnings.length === 0;

    const report: ConsistencyReport = {
      pools: poolCount,
      pairs: pairCount,
      graphEdges,
      graphNodes,
      registrySize,
      warnings,
      passed,
    };

    if (passed) {
      this.consistentCount++;
    } else {
      this.inconsistentCount++;
    }

    this.lastReport = report;
    return report;
  }

  printReport(report: ConsistencyReport): void {
    if (report.passed) {
      logSuccess(`StateConsistency: ✅ OK — ${report.pools} pools, ${report.pairs} pares, ${report.graphEdges} edges, ${report.graphNodes} nodos`);
      return;
    }

    logWarning(`========== CONSISTENCY REPORT (inconsistencias: ${report.warnings.length}) ==========`);
    for (const w of report.warnings) {
      logWarning(w);
    }
    logWarning(`Pools: ${report.pools} | Pairs: ${report.pairs} | Graph: ${report.graphEdges} edges / ${report.graphNodes} nodes`);
    logWarning(`Registry: ${report.registrySize}`);
    logWarning(`========================================`);
  }

  isConsistent(): boolean {
    return this.lastReport?.passed ?? true;
  }

  getStats(): { consistent: number; inconsistent: number; lastPassed: boolean } {
    return {
      consistent: this.consistentCount,
      inconsistent: this.inconsistentCount,
      lastPassed: this.lastReport?.passed ?? true,
    };
  }
}

export const stateConsistency = new StateConsistencyValidator();
