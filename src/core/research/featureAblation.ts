import { FeatureAblationResult } from "./types";
import { logInfo } from "../../logger";

export class FeatureAblation {
  private baselineWinRate = 0;
  private baselineAlphaLeakage = 0;
  private results: FeatureAblationResult[] = [];

  setBaseline(winRate: number, alphaLeakage: number): void {
    this.baselineWinRate = winRate;
    this.baselineAlphaLeakage = alphaLeakage;
  }

  record(featureRemoved: string, winRate: number, alphaLeakage: number, confidence: number): void {
    this.results.push({
      featureRemoved,
      winRateDelta: Math.round((winRate - this.baselineWinRate) * 100),
      alphaLeakageDelta: Math.round((alphaLeakage - this.baselineAlphaLeakage) * 100),
      confidenceDelta: Math.round(confidence * 100),
    });
  }

  printReport(): void {
    logInfo(`[ABLATION] baseline: winRate=${(this.baselineWinRate * 100).toFixed(0)}% alphaLeakage=${(this.baselineAlphaLeakage * 100).toFixed(0)}%`);
    for (const r of this.results) {
      logInfo(`  -${r.featureRemoved}: winRate=${r.winRateDelta > 0 ? "+" : ""}${r.winRateDelta}% alpha=${r.alphaLeakageDelta > 0 ? "+" : ""}${r.alphaLeakageDelta}%`);
    }
  }

  reset(): void { this.results = []; this.baselineWinRate = 0; this.baselineAlphaLeakage = 0; }
}

export const featureAblation = new FeatureAblation();
