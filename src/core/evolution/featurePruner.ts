import { FeatureROI } from "./types";
import { logInfo, logWarning } from "../../logger";

export class FeaturePruner {
  private disabled = new Set<string>();

  evaluate(features: FeatureROI[]): void {
    for (const f of features) {
      if (!f.enabled && !this.disabled.has(f.featureName)) {
        this.disabled.add(f.featureName);
        logWarning(`[PRUNER] disabled ${f.featureName} (ROI=${f.roiScore.toFixed(2)})`);
      }
    }
  }

  isDisabled(feature: string): boolean { return this.disabled.has(feature); }

  getDisabled(): string[] { return Array.from(this.disabled); }

  reset(): void { this.disabled.clear(); }
}

export const featurePruner = new FeaturePruner();
