import { FeatureROI } from "./types";
import { logInfo } from "../../logger";

export class FeatureROIAnalyzer {
  private features = new Map<string, { captures: number[]; latencies: number[] }>();

  record(feature: string, captureBps: number, latencyMs: number): void {
    const f = this.features.get(feature) || { captures: [], latencies: [] };
    f.captures.push(captureBps);
    f.latencies.push(latencyMs);
    if (f.captures.length > 100) { f.captures.shift(); f.latencies.shift(); }
    this.features.set(feature, f);
  }

  getROI(feature: string): FeatureROI {
    const f = this.features.get(feature);
    if (!f || f.captures.length < 5) {
      return { featureName: feature, captureDelta: 0, sharpeDelta: 0, leakageDelta: 0, latencyPenalty: 0, roiScore: 0, enabled: true };
    }

    const avgCapture = f.captures.reduce((a, b) => a + b, 0) / f.captures.length;
    const avgLatency = f.latencies.reduce((a, b) => a + b, 0) / f.latencies.length;

    const captureDelta = avgCapture * 0.4;
    const sharpeDelta = avgCapture > 0 ? 0.1 : -0.1;
    const leakageDelta = -Math.abs(avgCapture) * 0.2;
    const latencyPenalty = avgLatency > 5 ? 0.1 : 0;
    const roiScore = captureDelta * 0.4 + sharpeDelta * 0.3 + leakageDelta * 0.2 - latencyPenalty * 0.1;

    return {
      featureName: feature,
      captureDelta: Math.round(captureDelta * 100) / 100,
      sharpeDelta: Math.round(sharpeDelta * 100) / 100,
      leakageDelta: Math.round(leakageDelta * 100) / 100,
      latencyPenalty: Math.round(latencyPenalty * 100) / 100,
      roiScore: Math.round(roiScore * 100) / 100,
      enabled: roiScore > -0.05,
    };
  }

  getAllROI(): FeatureROI[] {
    return Array.from(this.features.keys()).map(f => this.getROI(f)).sort((a, b) => b.roiScore - a.roiScore);
  }

  reset(): void { this.features.clear(); }
}

export const featureROIAnalyzer = new FeatureROIAnalyzer();
