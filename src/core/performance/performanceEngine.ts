import { CriticalPathMetrics, GCPressure, EventLoopJitter } from "./types";
import { hotPathOptimizer } from "./hotPathOptimizer";
import { gcPressureTracker } from "./gcPressureTracker";
import { eventLoopJitterAnalyzer } from "./eventLoopJitterAnalyzer";
import { logInfo, logSuccess } from "../../logger";

export class PerformanceEngine {
  /** Record hot path timing */
  recordHotPath(decodeMs: number, graphMs: number, decisionMs: number, buildMs: number, serializeMs: number): void {
    hotPathOptimizer.record(decodeMs, graphMs, decisionMs, buildMs, serializeMs);
  }

  /** Record GC metrics */
  recordGc(youngMs: number, oldMs: number, allocRateMBs: number): void {
    gcPressureTracker.record(youngMs, oldMs, allocRateMBs);
  }

  /** Tick event loop monitor */
  tickEventLoop(): void {
    eventLoopJitterAnalyzer.tick();
  }

  getCriticalPath(): CriticalPathMetrics { return hotPathOptimizer.getCriticalPath(); }
  getGcPressure(): GCPressure { return gcPressureTracker.getPressure(); }
  getJitter(): EventLoopJitter { return eventLoopJitterAnalyzer.getJitter(); }

  /** Print performance dashboard */
  printDashboard(): void {
    const path = this.getCriticalPath();
    const gc = this.getGcPressure();
    const jitter = this.getJitter();

    logSuccess(`━━━━━━━━ [PERFORMANCE ENGINE] ──────────`);
    logInfo(`Internal pipeline: ${path.totalMs}ms p50=${path.p50Ms}ms p95=${path.p95Ms}ms p99=${path.p99Ms}ms`);
    logInfo(`Critical path: decode=${path.decodeMs}ms graph=${path.graphMs}ms decision=${path.decisionMs}ms build=${path.buildMs}ms serialize=${path.serializeMs}ms`);
    logInfo(`GC pressure: ${gc.pressure} (young=${gc.youngGcMs}ms old=${gc.oldGcMs}ms allocRate=${gc.allocationRateMBs}MB/s)`);
    logInfo(`Event loop jitter: avg=${jitter.avgJitterMs}ms max=${jitter.maxJitterMs}ms slowTicks=${jitter.slowTickCount}`);
    logSuccess(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  reset(): void { hotPathOptimizer.reset(); gcPressureTracker.reset(); eventLoopJitterAnalyzer.reset(); }
}

export const performanceEngine = new PerformanceEngine();
