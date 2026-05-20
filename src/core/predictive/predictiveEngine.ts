import { fuseSignals, logUnifiedSignal } from "./signalFusion";
import { detectAnomaly } from "./anomalyDetector";
import { predictSpreadExpansion } from "./spreadExpansionPredictor";
import { logInfo } from "../../logger";

export class PredictiveEngine {
  /** Full predictive analysis for a market/pool */
  analyze(market: string, pool: string, currentSpreadBps: number): void {
    // Fusion all predictive signals
    const signal = fuseSignals(market, pool);
    logUnifiedSignal(signal);

    // Spread expansion prediction
    const spread = predictSpreadExpansion(market, pool, currentSpreadBps);
    if (spread.direction === "WIDEN") {
      logInfo(`[PREDICT] ${market} spread expansion: ${currentSpreadBps.toFixed(1)}→${spread.expectedBps.toFixed(1)}bps prob=${(spread.probability * 100).toFixed(0)}%`);
    }

    // Anomaly detection
    const anomaly = detectAnomaly(pool, market);
    if (anomaly.detected) {
      logInfo(`[ANOMALY] ${market} ${anomaly.description}`);
    }
  }

  reset(): void {}
}

export const predictiveEngine = new PredictiveEngine();
