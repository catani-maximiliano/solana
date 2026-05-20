import { analyzeCapture, logCaptureAnalysis } from "./captureOptimizer";
import { relayPerformanceTracker } from "./relayPerformanceTracker";
import { pairProfitabilityFilter } from "./pairProfitabilityFilter";
import { scoreExecutionQuality } from "./executionQualityScorer";
import { getAdaptiveMode } from "./adaptiveExecutionMode";
import { AdaptiveMode, CaptureBreakdown, ExecutionQualityScore } from "./types";
import { logInfo, logSuccess } from "../../logger";

export class OptimizationEngine {
  /** Analyze capture breakdown */
  analyzeCapture(expected: number, captured: number, slippage: number, bundle: number, latency: number, delayed: number): CaptureBreakdown {
    const result = analyzeCapture(expected, captured, slippage, bundle, latency, delayed);
    logCaptureAnalysis(result);
    return result;
  }

  /** Track relay performance */
  recordRelay(relay: string, latencyMs: number, included: boolean): void {
    relayPerformanceTracker.record(relay, latencyMs, included);
  }

  /** Track pair profitability */
  recordPairTrade(pair: string, won: boolean, returnBps: number, leakage: number): void {
    pairProfitabilityFilter.record(pair, won, returnBps, leakage);
  }

  /** Score execution quality */
  scoreQuality(fillPct: number, expectedSlip: number, realizedSlip: number, latencyMs: number, captureRate: number, bundleWon: boolean): ExecutionQualityScore {
    return scoreExecutionQuality(fillPct, expectedSlip, realizedSlip, latencyMs, captureRate, bundleWon);
  }

  /** Get adaptive execution mode */
  getAdaptiveMode(regime: string, congestion: string, competition: string, recentCaptureRate: number): AdaptiveMode {
    return getAdaptiveMode(regime, congestion, competition, recentCaptureRate);
  }

  /** Print optimization dashboard */
  printDashboard(): void {
    const relays = relayPerformanceTracker.getRankings();
    const disabled = pairProfitabilityFilter.getDisabledPairs();

    logSuccess(`━━━━━━━━ [EXECUTION OPTIMIZATION] ──────────`);
    logInfo(`Best relay: ${relays.length > 0 ? relays[0].name : "N/A"} (${relays[0]?.latencyMs || 0}ms inc=${relays[0]?.inclusionRate || 0}%)`);
    logInfo(`Disabled pairs: ${disabled.length > 0 ? disabled.join(", ") : "none"}`);
    logInfo(`Capture optimization: active`);
    logInfo(`Execution quality scoring: active`);
    logInfo(`Adaptive execution mode: active`);
    logSuccess(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  reset(): void {
    relayPerformanceTracker.reset();
    pairProfitabilityFilter.reset();
  }
}

export const optimizationEngine = new OptimizationEngine();
