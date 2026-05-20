export class OpportunityLifetimeTracker {
  private lifetimes: number[] = [];

  record(lifetimeMs: number): void {
    this.lifetimes.push(lifetimeMs);
    if (this.lifetimes.length > 2000) this.lifetimes.shift();
  }

  getMedian(): number {
    if (this.lifetimes.length === 0) return 0;
    const sorted = [...this.lifetimes].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.5)];
  }

  getP95(): number {
    if (this.lifetimes.length === 0) return 0;
    const sorted = [...this.lifetimes].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.95)];
  }

  getDistribution(): { under50: number; under100: number; under250: number; under500: number; over500: number } {
    const under50 = this.lifetimes.filter(l => l < 50).length;
    const under100 = this.lifetimes.filter(l => l < 100).length;
    const under250 = this.lifetimes.filter(l => l < 250).length;
    const under500 = this.lifetimes.filter(l => l < 500).length;
    const over500 = this.lifetimes.filter(l => l >= 500).length;
    return { under50, under100, under250, under500, over500 };
  }

  reset(): void { this.lifetimes = []; }
}

export const opportunityLifetime = new OpportunityLifetimeTracker();
