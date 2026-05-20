export class AlphaLeakageTracker {
  private leakages: number[] = [];

  record(expectedBps: number, realizedBps: number): void {
    this.leakages.push(expectedBps - realizedBps);
    if (this.leakages.length > 500) this.leakages.shift();
  }

  getAvgLeakageBps(): number {
    if (this.leakages.length === 0) return 0;
    return this.leakages.reduce((a, b) => a + b, 0) / this.leakages.length;
  }

  getTotalLeakageBps(): number {
    return this.leakages.reduce((a, b) => a + b, 0);
  }

  reset(): void { this.leakages = []; }
}

export const alphaLeakageTracker = new AlphaLeakageTracker();
