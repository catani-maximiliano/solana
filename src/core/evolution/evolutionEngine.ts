import { FeatureROI, EfficiencyMetrics, RegimeParams } from "./types";
import { featureROIAnalyzer } from "./featureROIAnalyzer";
import { featurePruner } from "./featurePruner";
import { executionEfficiencyTracker } from "./executionEfficiencyTracker";
import { regimeSpecificOptimizer } from "./regimeSpecificOptimizer";
import { logInfo, logSuccess } from "../../logger";

export class EvolutionEngine {
  /** Record a feature usage for ROI analysis */
  recordFeature(feature: string, captureBps: number, latencyMs: number): void {
    featureROIAnalyzer.record(feature, captureBps, latencyMs);
  }

  /** Record execution for efficiency tracking */
  recordExecution(captureBps: number, pnlBps: number, latencyMs: number, bundleWon: boolean): void {
    executionEfficiencyTracker.record(captureBps, pnlBps, latencyMs, bundleWon);
  }

  /** Run optimization: evaluate ROI, prune, tune */
  optimize(regime: string): void {
    // Evaluate feature ROI
    const allROI = featureROIAnalyzer.getAllROI();
    featurePruner.evaluate(allROI);

    // Update regime params based on efficiency
    const efficiency = executionEfficiencyTracker.getEfficiency();
    const currentParams = regimeSpecificOptimizer.getParams(regime);

    // Auto-tune based on efficiency
    if (efficiency.capturePerMs < 1) {
      regimeSpecificOptimizer.updateParams(regime, {
        confidenceThreshold: Math.min(0.9, currentParams.confidenceThreshold + 0.05),
        aggressiveness: Math.max(0.1, currentParams.aggressiveness - 0.05),
      });
    } else {
      regimeSpecificOptimizer.updateParams(regime, {
        confidenceThreshold: Math.max(0.3, currentParams.confidenceThreshold - 0.02),
        aggressiveness: Math.min(0.9, currentParams.aggressiveness + 0.02),
      });
    }
  }

  /** Check if a feature should be disabled */
  isFeatureDisabled(feature: string): boolean {
    return featurePruner.isDisabled(feature);
  }

  /** Get regime-specific parameters */
  getRegimeParams(regime: string): RegimeParams {
    return regimeSpecificOptimizer.getParams(regime);
  }

  /** Print evolution dashboard */
  printDashboard(): void {
    const allROI = featureROIAnalyzer.getAllROI();
    const disabled = featurePruner.getDisabled();
    const efficiency = executionEfficiencyTracker.getEfficiency();

    logSuccess(`━━━━━━━━ [EVOLUTION ENGINE] ──────────`);
    logInfo(`Feature ROI:`);
    for (const r of allROI.slice(0, 5)) {
      logInfo(`  ${r.featureName.padEnd(20)} ${r.roiScore >= 0 ? "+" : ""}${(r.roiScore * 100).toFixed(0)}% ${r.enabled ? "✅" : "⛔"}`);
    }
    if (disabled.length > 0) logInfo(`Disabled features: ${disabled.join(", ")}`);
    logInfo(`Capture efficiency: ${efficiency.capturePerMs.toFixed(3)} capture/ms`);
    logInfo(`PnL efficiency: ${efficiency.pnlPerMs.toFixed(4)} pnl/ms`);
    logInfo(`Adaptive optimization: ACTIVE`);
    logSuccess(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  reset(): void {
    featureROIAnalyzer.reset();
    featurePruner.reset();
    executionEfficiencyTracker.reset();
    regimeSpecificOptimizer.reset();
  }
}

export const evolutionEngine = new EvolutionEngine();
