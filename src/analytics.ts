import { logInfo, logSuccess } from "./logger";
import { marketState } from "./market";
import { priceGraph } from "./graph";
import { graphDetector } from "./detector";
import { circuitBreaker } from "./circuit-breaker";

export interface SessionMetrics {
  checksCount: number;
  opportunitiesFound: number;
  totalProfitUsd: number;
  errorsCount: number;
  startTime: Date;
}

class Analytics {
  private sessions: SessionMetrics[] = [];
  private currentSession: SessionMetrics = {
    checksCount: 0,
    opportunitiesFound: 0,
    totalProfitUsd: 0,
    errorsCount: 0,
    startTime: new Date(),
  };
  private lastActivity = 0;
  private totalErrorCount = 0;

  isStale(maxAgeMs: number = 30_000): boolean {
    return Date.now() - this.lastActivity > maxAgeMs;
  }

  recordCheck(): void {
    this.currentSession.checksCount++;
    this.lastActivity = Date.now();
  }

  recordOpportunity(profitUsd: number): void {
    this.currentSession.opportunitiesFound++;
    this.currentSession.totalProfitUsd += profitUsd;
  }

  recordError(): void {
    this.currentSession.errorsCount++;
    this.totalErrorCount++;
  }

  getSessionMetrics(): SessionMetrics {
    return { ...this.currentSession };
  }

  getTotalErrors(): number {
    return this.totalErrorCount;
  }

  getHealth() {
    const cacheStats = marketState.getStats();
    const detectorStats = graphDetector.getStats();
    return {
      pools: cacheStats.pools,
      pairs: cacheStats.pairs,
      updates: cacheStats.updates,
      graphNodes: priceGraph.getNodeCount(),
      graphEdges: priceGraph.getEdgeCount(),
      scans: detectorStats.totalScans,
      candidates: detectorStats.totalCandidates,
      sessionChecks: this.currentSession.checksCount,
      sessionOpps: this.currentSession.opportunitiesFound,
      sessionErrors: this.currentSession.errorsCount,
      totalErrors: this.totalErrorCount,
    };
  }

  getPairStats() {
    return marketState.getStats().pairDetails.map((p) => ({
      label: p.label,
      price: p.price,
      updates: p.updates,
      age: p.age,
    }));
  }

  getDexStats() {
    const activeDexes = marketState.getActiveDexes();
    return activeDexes.map((dex) => ({
      dexName: dex,
      pools: marketState.getAllPools().filter((p) => p.dex === dex).length,
    }));
  }

  printStatsReport(): void {
    const cacheStats = marketState.getStats();
    const detectorStats = graphDetector.getStats();
    const circuitState = circuitBreaker.getState();
    const session = this.currentSession;

    logSuccess("========== ON-CHAIN ANALYTICS REPORT ==========");
    logInfo(`Session: ${session.checksCount} checks, ${session.opportunitiesFound} opps, $${session.totalProfitUsd.toFixed(4)} profit, ${session.errorsCount} errors`);
    logInfo(`Market cache: ${cacheStats.pools} pools, ${cacheStats.pairs} pares, ${cacheStats.updates} updates totales`);
    logInfo(`Graph: ${priceGraph.getNodeCount()} nodos, ${priceGraph.getEdgeCount()} edges`);
    logInfo(`Detector: ${detectorStats.totalScans} scans, ${detectorStats.totalCandidates} candidatos totales`);

    const pairStats = this.getPairStats();
    if (pairStats.length > 0) {
      logInfo("--- Pairs ---");
      for (const ps of pairStats) {
        logInfo(`${ps.label} | updates: ${ps.updates} | price: $${ps.price.toFixed(4)} | age: ${(ps.age / 1000).toFixed(1)}s`);
      }
    }

    const dexStats = this.getDexStats();
    if (dexStats.length > 0) {
      logInfo("--- DEXes ---");
      for (const ds of dexStats) {
        logInfo(`${ds.dexName} | ${ds.pools} pools`);
      }
    }

    if (circuitState.degraded) {
      logInfo(`Circuit Breaker: DEGRADED (${circuitState.consecutiveFailures} fallos)`);
    } else {
      logInfo(`Circuit Breaker: OK`);
    }

    logInfo(`Total errors: ${this.totalErrorCount}`);
    logSuccess("========== END REPORT ==========");
  }

  reset(): void {
    this.currentSession = {
      checksCount: 0,
      opportunitiesFound: 0,
      totalProfitUsd: 0,
      errorsCount: 0,
      startTime: new Date(),
    };
    this.lastActivity = 0;
    this.totalErrorCount = 0;
    logInfo("Analytics: reset completo");
  }

  resetWindow(): void {
    // no-op: window reset no longer needed
  }
}

export const analytics = new Analytics();
