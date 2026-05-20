import { CalibrationResult } from "./types";
import { opportunityLifetime } from "./opportunityLifetime";

export class CalibrationEngine {
  private samples = 0;
  private totalDecay = 0;
  private totalFillProb = 0;
  private falsePositiveRate = 1;

  record(isFalsePositive: boolean, decay: number, fillProb: number): void {
    this.samples++;
    if (isFalsePositive) this.falsePositiveRate = (this.falsePositiveRate * (this.samples - 1) + 1) / this.samples;
    this.totalDecay += Math.abs(decay);
    this.totalFillProb += fillProb;
  }

  calibrate(): CalibrationResult {
    const avgDecay = this.samples > 0 ? this.totalDecay / this.samples : 0.5;
    const avgFill = this.samples > 0 ? this.totalFillProb / this.samples : 0.5;
    const p95 = opportunityLifetime.getP95();

    // Auto-tune based on observed behavior
    const slippageMultiplier = Math.max(0.5, Math.min(2, avgDecay * 10));
    const survivalThresholdMs = Math.max(50, Math.min(500, p95 * 0.3));
    const fillProbabilityBase = Math.max(0.2, Math.min(0.9, avgFill));
    const toxicityPenaltyMultiplier = Math.max(0.5, Math.min(2, this.falsePositiveRate * 2));
    const confidenceThreshold = Math.max(0.2, Math.min(0.8, 1 - this.falsePositiveRate));

    return {
      slippageMultiplier: Math.round(slippageMultiplier * 100) / 100,
      survivalThresholdMs: Math.round(survivalThresholdMs),
      fillProbabilityBase: Math.round(fillProbabilityBase * 100) / 100,
      toxicityPenaltyMultiplier: Math.round(toxicityPenaltyMultiplier * 100) / 100,
      confidenceThreshold: Math.round(confidenceThreshold * 100) / 100,
    };
  }

  reset(): void { this.samples = 0; this.totalDecay = 0; this.totalFillProb = 0; this.falsePositiveRate = 1; }
}

export const calibrationEngine = new CalibrationEngine();
