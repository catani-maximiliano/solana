import { MetaReport, SignalWeights, RegimeType } from "./types";
import { signalAttribution } from "./signalAttribution";
import { decisionOutcomeTracker } from "./decisionOutcomeTracker";
import { detectRegime } from "./regimeDetector";
import { computeAdaptiveWeights } from "./adaptiveWeighting";
import { logInfo, logSuccess } from "../../logger";

export class MetaEngine {
  private currentRegime: RegimeType = { name: "UNKNOWN", volatility: "LOW", crowding: "LOW", description: "initial" };
  private currentWeights: SignalWeights = {
    flow: 1.0, toxicity: 1.0, timing: 1.0, alpha: 1.0,
    competition: 1.0, microstructure: 1.0, spreadPersistence: 1.0, orderbook: 1.0,
  };

  /** Record decision outcome and update weights */
  recordDecision(
    features: Record<string, number>,
    wasSuccessful: boolean,
    falsePositive: boolean,
    executionViable: boolean,
    pair: string,
    pool: string,
  ): void {
    // Detect regime
    this.currentRegime = detectRegime(pair, pool);

    // Track outcome
    decisionOutcomeTracker.record(features, wasSuccessful, falsePositive, executionViable, this.currentRegime.name);

    // Update weights every 50 decisions
    if (decisionOutcomeTracker["totalDecisions"] % 50 === 0) {
      const importance = signalAttribution.getImportance();
      this.currentWeights = computeAdaptiveWeights(this.currentRegime, importance);
    }
  }

  /** Get meta report */
  getReport(): MetaReport {
    const importance = signalAttribution.getImportance();
    const top = importance.slice(0, 5);
    const worst = importance.slice(-5).reverse();
    const fpReducers = importance.filter(i => i.direction === "POSITIVE" && i.signal.includes("toxic")).map(i => i.signal);

    return {
      topContributors: top,
      worstPredictors: worst,
      falsePositiveReducers: fpReducers,
      regime: this.currentRegime.name,
      weights: this.currentWeights,
      totalDecisions: decisionOutcomeTracker["totalDecisions"],
      successRate: Math.round(decisionOutcomeTracker.getSuccessRate() * 100),
    };
  }

  /** Print meta dashboard */
  printReport(): void {
    const r = this.getReport();
    logSuccess(`━━━━━━━━ [META ENGINE] ──────────`);
    logInfo(`Regime: ${r.regime}`);
    logInfo(`Total decisions: ${r.totalDecisions} | Success rate: ${r.successRate}%`);
    logInfo(`Top alpha contributors:`);
    for (const fi of r.topContributors.slice(0, 3)) {
      logInfo(`  ${fi.signal}: ${fi.direction === "POSITIVE" ? "+" : ""}${(fi.contribution * 100).toFixed(0)}% (conf=${(fi.confidence * 100).toFixed(0)}%)`);
    }
    logInfo(`Adaptive weights:`);
    for (const [k, v] of Object.entries(r.weights)) {
      if (v !== 1.0) logInfo(`  ${k}: ${v.toFixed(1)}x`);
    }
    logInfo(`Worst predictors:`);
    for (const fi of r.worstPredictors.slice(0, 3)) {
      if (fi.contribution < 0) logInfo(`  ${fi.signal}: ${(fi.contribution * 100).toFixed(0)}%`);
    }
    logSuccess(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  getWeights(): SignalWeights { return this.currentWeights; }
  getRegime(): RegimeType { return this.currentRegime; }

  reset(): void {
    signalAttribution.reset();
    decisionOutcomeTracker.reset();
  }
}

export const metaEngine = new MetaEngine();
