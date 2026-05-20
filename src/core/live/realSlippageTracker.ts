import { RealSlippageInfo } from "./types";
import { logInfo } from "../../logger";

export class RealSlippageTracker {
  private leakages: number[] = [];

  record(expectedBps: number, realizedBps: number): void {
    const leakage = realizedBps - expectedBps;
    this.leakages.push(leakage);
    if (this.leakages.length > 200) this.leakages.shift();
    logInfo(`[SLIPPAGE] expected=${expectedBps.toFixed(1)}bps realized=${realizedBps.toFixed(1)}bps leakage=${leakage.toFixed(1)}bps`);
  }

  getAvgLeakage(): number {
    if (this.leakages.length === 0) return 0;
    return this.leakages.reduce((a, b) => a + b, 0) / this.leakages.length;
  }

  reset(): void { this.leakages = []; }
}

export const realSlippageTracker = new RealSlippageTracker();
