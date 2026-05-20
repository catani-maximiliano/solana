import { EfficiencyMetrics } from "./types";

export class ExecutionEfficiencyTracker {
  private captures: number[] = [];
  private pnls: number[] = [];
  private latencies: number[] = [];
  private bundleWins: boolean[] = [];

  record(captureBps: number, pnlBps: number, latencyMs: number, bundleWon: boolean): void {
    this.captures.push(captureBps);
    this.pnls.push(pnlBps);
    this.latencies.push(latencyMs);
    this.bundleWins.push(bundleWon);
    if (this.captures.length > 200) { this.captures.shift(); this.pnls.shift(); this.latencies.shift(); this.bundleWins.shift(); }
  }

  getEfficiency(): EfficiencyMetrics {
    const totalLat = this.latencies.reduce((a, b) => a + b, 0) || 1;
    return {
      capturePerMs: Math.round((this.captures.reduce((a, b) => a + b, 0) / totalLat) * 1000) / 1000,
      pnlPerMs: Math.round((this.pnls.reduce((a, b) => a + b, 0) / totalLat) * 1000) / 1000,
      leakagePerMs: 0,
      bundleWinPerMs: Math.round((this.bundleWins.filter(w => w).length / totalLat) * 1000) / 1000,
    };
  }

  reset(): void { this.captures = []; this.pnls = []; this.latencies = []; this.bundleWins = []; }
}

export const executionEfficiencyTracker = new ExecutionEfficiencyTracker();
