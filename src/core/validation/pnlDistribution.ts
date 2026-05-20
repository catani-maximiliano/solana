import { PnLDistribution } from "./types";

export class PnLDistributionTracker {
  private returns: number[] = [];

  record(pnlBps: number): void {
    this.returns.push(pnlBps);
    if (this.returns.length > 1000) this.returns.shift();
  }

  getDistribution(): PnLDistribution {
    const sorted = [...this.returns].sort((a, b) => a - b);
    const n = sorted.length;
    if (n === 0) return { median: 0, p95: 0, p99: 0, skew: 0, kurtosis: 0, tailRisk: 0 };

    const median = sorted[Math.floor(n * 0.5)];
    const p95 = sorted[Math.floor(n * 0.95)];
    const p99 = sorted[Math.floor(n * 0.99)];
    const mean = sorted.reduce((a, b) => a + b, 0) / n;

    const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    const std = Math.sqrt(variance);
    const skew = std > 0 ? sorted.reduce((s, v) => s + ((v - mean) / std) ** 3, 0) / n : 0;
    const kurtosis = std > 0 ? sorted.reduce((s, v) => s + ((v - mean) / std) ** 4, 0) / n - 3 : 0;

    // Tail risk: probability of return worse than -1 std
    const tailRisk = std > 0 ? sorted.filter(r => r < mean - std).length / n : 0;

    return {
      median: Math.round(median * 100) / 100,
      p95: Math.round(p95 * 100) / 100,
      p99: Math.round(p99 * 100) / 100,
      skew: Math.round(skew * 1000) / 1000,
      kurtosis: Math.round(kurtosis * 1000) / 1000,
      tailRisk: Math.round(tailRisk * 1000) / 1000,
    };
  }

  getSampleSize(): number { return this.returns.length; }

  reset(): void { this.returns = []; }
}

export const pnlDistribution = new PnLDistributionTracker();
