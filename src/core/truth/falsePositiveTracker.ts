import { FalsePositiveReport } from "./types";

export class FalsePositiveTracker {
  private total = 0;
  private diedBefore100 = 0;
  private diedBefore250 = 0;
  private diedBefore500 = 0;
  private neverExecutable = 0;

  record(lifetimeMs: number, wasExecutable: boolean): void {
    this.total++;
    if (lifetimeMs < 100) this.diedBefore100++;
    if (lifetimeMs < 250) this.diedBefore250++;
    if (lifetimeMs < 500) this.diedBefore500++;
    if (!wasExecutable) this.neverExecutable++;
  }

  getReport(): FalsePositiveReport {
    return {
      total: this.total,
      diedBefore100ms: this.diedBefore100,
      diedBefore250ms: this.diedBefore250,
      diedBefore500ms: this.diedBefore500,
      neverExecutable: this.neverExecutable,
    };
  }

  reset(): void { this.total = 0; this.diedBefore100 = 0; this.diedBefore250 = 0; this.diedBefore500 = 0; this.neverExecutable = 0; }
}

export const falsePositiveTracker = new FalsePositiveTracker();
