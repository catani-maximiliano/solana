import { EdgeAnalysis, CaptureBreakdown, PnLDistribution, RiskAdjustedMetrics } from "./types";
import { validateEdge, logEdgeAnalysis } from "./edgeValidator";
import { captureRateAnalyzer } from "./captureRateAnalyzer";
import { pnlDistribution } from "./pnlDistribution";
import { computeRiskAdjusted } from "./riskAdjustedReturn";
import { latencyImpactAnalyzer } from "./latencyImpactAnalysis";
import { logInfo, logSuccess } from "../../logger";

export class ValidationEngine {
  private totalDetectedAlpha = 0;
  private totalCapturedAlpha = 0;
  private totalTrades = 0;

  recordTradeResult(detectedBps: number, capturedBps: number, pair: string, regime: string, relay: string, latencyMs: number): void {
    this.totalDetectedAlpha += Math.abs(detectedBps);
    this.totalCapturedAlpha += Math.max(0, capturedBps);
    this.totalTrades++;
    captureRateAnalyzer.record(pair, regime, relay, detectedBps, capturedBps);
    pnlDistribution.record(capturedBps);
    latencyImpactAnalyzer.record(latencyMs, capturedBps);
  }

  getEdgeAnalysis(): EdgeAnalysis {
    return validateEdge(this.totalDetectedAlpha, this.totalCapturedAlpha, this.totalTrades);
  }

  getCaptureBreakdown(): CaptureBreakdown { return captureRateAnalyzer.getBreakdown(); }
  getPnlDistribution(): PnLDistribution { return pnlDistribution.getDistribution(); }
  getRiskAdjusted(): RiskAdjustedMetrics { return computeRiskAdjusted(); }

  /** Print full validation dashboard */
  printReport(): void {
    const edge = this.getEdgeAnalysis();
    const capture = this.getCaptureBreakdown();
    const pnl = this.getPnlDistribution();
    const risk = this.getRiskAdjusted();

    logSuccess(`━━━━━━━━ [VALIDATION ENGINE] ──────────`);
    logEdgeAnalysis(edge);

    logInfo(`\nLeakage breakdown:`);
    logInfo(`  slippage: ${pnl.skew > 0 ? "moderate" : "low"}`);
    logInfo(`  tail risk: ${(pnl.tailRisk * 100).toFixed(1)}%`);

    logInfo(`\nBest capture by pair:`);
    for (const [pair, rate] of Object.entries(capture.byPair).sort((a, b) => b[1] - a[1]).slice(0, 3)) {
      logInfo(`  ${pair}: ${rate}%`);
    }

    logInfo(`\nBest capture by regime:`);
    for (const [regime, rate] of Object.entries(capture.byRegime).sort((a, b) => b[1] - a[1]).slice(0, 3)) {
      logInfo(`  ${regime}: ${rate}%`);
    }

    logInfo(`\nBest relay:`);
    for (const [relay, rate] of Object.entries(capture.byRelay).sort((a, b) => b[1] - a[1]).slice(0, 3)) {
      logInfo(`  ${relay}: ${rate}%`);
    }

    latencyImpactAnalyzer.printReport();

    logInfo(`\nRisk-adjusted metrics:`);
    logInfo(`  Sharpe-like: ${risk.sharpeLike.toFixed(2)}`);

    logSuccess(`\nStatistical significance: ${edge.isSignificant ? "✅ CONFIRMED" : "⏳ INSUFFICIENT DATA"}`);
    logSuccess(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  reset(): void {
    this.totalDetectedAlpha = 0;
    this.totalCapturedAlpha = 0;
    this.totalTrades = 0;
    captureRateAnalyzer.reset();
    pnlDistribution.reset();
    latencyImpactAnalyzer.reset();
  }
}

export const validationEngine = new ValidationEngine();
