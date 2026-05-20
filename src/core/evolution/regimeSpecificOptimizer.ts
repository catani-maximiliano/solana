import { RegimeParams } from "./types";

const DEFAULT_PARAMS: Record<string, RegimeParams> = {
  HIGH_VOL: { timing: "FIRE_NOW", slippageMultiplier: 1.2, feePolicy: "normal", confidenceThreshold: 0.5, aggressiveness: 0.8 },
  LOW_VOL: { timing: "WAIT_250MS", slippageMultiplier: 0.8, feePolicy: "conservative", confidenceThreshold: 0.6, aggressiveness: 0.4 },
  TOXIC: { timing: "FIRE_NOW", slippageMultiplier: 0.5, feePolicy: "aggressive", confidenceThreshold: 0.7, aggressiveness: 0.2 },
  MEV_SWARM: { timing: "FIRE_NOW", slippageMultiplier: 0.3, feePolicy: "aggressive", confidenceThreshold: 0.8, aggressiveness: 0.1 },
  NEUTRAL: { timing: "WAIT_100MS", slippageMultiplier: 1.0, feePolicy: "normal", confidenceThreshold: 0.5, aggressiveness: 0.5 },
};

export class RegimeSpecificOptimizer {
  private activeParams = { ...DEFAULT_PARAMS };

  getParams(regime: string): RegimeParams {
    return this.activeParams[regime] || this.activeParams.NEUTRAL;
  }

  updateParams(regime: string, params: Partial<RegimeParams>): void {
    if (!this.activeParams[regime]) return;
    this.activeParams[regime] = { ...this.activeParams[regime], ...params };
  }

  reset(): void { this.activeParams = { ...DEFAULT_PARAMS }; }
}

export const regimeSpecificOptimizer = new RegimeSpecificOptimizer();
