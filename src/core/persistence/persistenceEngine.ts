import { LongitudinalReport, RollingMetrics, LedgerEntry } from "./types";
import { executionHistoryStore } from "./executionHistoryStore";
import { longTermEdgeTracker } from "./longTermEdgeTracker";
import { edgeDecayDetector } from "./edgeDecayDetector";
import { logInfo, logSuccess } from "../../logger";

export class PersistenceEngine {
  /** Record an execution outcome */
  recordExecution(entry: LedgerEntry): void {
    executionHistoryStore.append(entry);
  }

  /** Get rolling metrics for a time window */
  getRolling(window: string): RollingMetrics {
    return longTermEdgeTracker.getRolling(window);
  }

  /** Get all rolling windows */
  getAllRolling(): Record<string, RollingMetrics> {
    return longTermEdgeTracker.getAllWindows();
  }

  /** Detect edge decay for a pair */
  detectEdgeDecay(pair: string) {
    return edgeDecayDetector.detect(pair);
  }

  /** Get longitudinal report */
  getReport(): LongitudinalReport {
    const rolling1h = this.getRolling("1h");
    const rolling7d = this.getRolling("7d");

    // Detect capture trend
    const allEntries = executionHistoryStore.getAll();
    const half = Math.floor(allEntries.length / 2);
    const old = allEntries.slice(0, half);
    const recent = allEntries.slice(-half);
    const oldCapture = old.reduce((s, e) => s + Math.max(0, e.capturedBps), 0) / Math.max(1, old.length);
    const recentCapture = recent.reduce((s, e) => s + Math.max(0, e.capturedBps), 0) / Math.max(1, recent.length);

    let captureTrend: "IMPROVING" | "STABLE" | "DECLINING" = "STABLE";
    if (recentCapture > oldCapture * 1.1) captureTrend = "IMPROVING";
    else if (recentCapture < oldCapture * 0.9) captureTrend = "DECLINING";

    // Top relay
    const relayStats = new Map<string, number[]>();
    for (const e of allEntries) {
      const list = relayStats.get(e.relay) || [];
      list.push(e.capturedBps);
      relayStats.set(e.relay, list);
    }
    let topRelay = "none";
    let bestAvg = -Infinity;
    for (const [relay, caps] of relayStats) {
      const avg = caps.reduce((a, b) => a + b, 0) / caps.length;
      if (avg > bestAvg) { bestAvg = avg; topRelay = relay; }
    }

    // Top regime
    const regimeStats = new Map<string, number[]>();
    for (const e of allEntries) {
      const list = regimeStats.get(e.regime) || [];
      list.push(e.capturedBps);
      regimeStats.set(e.regime, list);
    }
    let topRegime = "none";
    let bestRegimeAvg = -Infinity;
    for (const [regime, caps] of regimeStats) {
      const avg = caps.reduce((a, b) => a + b, 0) / caps.length;
      if (avg > bestRegimeAvg) { bestRegimeAvg = avg; topRegime = regime; }
    }

    return {
      currentCapture: rolling1h,
      captureTrend,
      edgeDecayed: false,
      regimeShift: false,
      topRelay,
      topRegime,
    };
  }

  /** Print persistence dashboard */
  printDashboard(): void {
    const rolling = this.getAllRolling();
    const report = this.getReport();

    logSuccess(`━━━━━━━━ [PERSISTENCE ENGINE] ──────────`);
    logInfo(`Rolling capture:`);
    for (const [k, v] of Object.entries(rolling)) {
      logInfo(`  ${k.padEnd(5)} ${v.captureRate}% (sharpe=${v.sharpe.toFixed(2)}, n=${v.sampleSize})`);
    }
    logInfo(`Trend: ${report.captureTrend}`);
    logInfo(`Top relay: ${report.topRelay}`);
    logInfo(`Top regime: ${report.topRegime}`);
    logInfo(`Total executions stored: ${executionHistoryStore.getAll().length}`);
    logSuccess(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  reset(): void {
    executionHistoryStore.reset();
    longTermEdgeTracker.reset();
    edgeDecayDetector.reset();
  }
}

export const persistenceEngine = new PersistenceEngine();
