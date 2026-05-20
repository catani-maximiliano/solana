import { RegimeBacktestResult } from "./types";
import { logInfo } from "../../logger";

export class RegimeBacktester {
  private results = new Map<string, RegimeBacktestResult>();

  record(regime: string, winRate: number, avgReturnBps: number, survivalMs: number): void {
    const existing = this.results.get(regime) || { regime, winRate: 0, avgReturnBps: 0, survivalMs: 0, sampleCount: 0 };
    existing.sampleCount++;
    existing.winRate = (existing.winRate * (existing.sampleCount - 1) + winRate) / existing.sampleCount;
    existing.avgReturnBps = (existing.avgReturnBps * (existing.sampleCount - 1) + avgReturnBps) / existing.sampleCount;
    existing.survivalMs = (existing.survivalMs * (existing.sampleCount - 1) + survivalMs) / existing.sampleCount;
    this.results.set(regime, existing);
  }

  getBestRegime(): string {
    let best = "";
    let bestRate = 0;
    for (const [, r] of this.results) {
      if (r.winRate > bestRate) { best = r.regime; bestRate = r.winRate; }
    }
    return best || "UNKNOWN";
  }

  printReport(): void {
    for (const [, r] of this.results) {
      logInfo(`  ${r.regime.padEnd(15)} winRate=${(r.winRate * 100).toFixed(0)}% avgReturn=${r.avgReturnBps.toFixed(1)}bps samples=${r.sampleCount}`);
    }
  }

  reset(): void { this.results.clear(); }
}

export const regimeBacktester = new RegimeBacktester();
