export class MissedOpportunityTracker {
  private missed: { pair: string; expectedBps: number; reason: string }[] = [];

  record(pair: string, expectedBps: number, reason: string): void {
    this.missed.push({ pair, expectedBps, reason });
    if (this.missed.length > 500) this.missed.shift();
  }

  getMissedCount(): number { return this.missed.length; }

  getMissedAlpha(): number {
    return this.missed.reduce((s, m) => s + m.expectedBps, 0);
  }

  reset(): void { this.missed = []; }
}

export const missedOpportunityTracker = new MissedOpportunityTracker();
