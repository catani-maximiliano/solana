import { logInfo } from "../../logger";

export class RealizedVsExpectedTracker {
  private gaps: number[] = [];

  record(expectedPnl: number, realizedPnl: number): void {
    const gap = expectedPnl - realizedPnl;
    this.gaps.push(gap);
    if (this.gaps.length > 500) this.gaps.shift();
  }

  getAlphaLeakage(): number {
    if (this.gaps.length === 0) return 0;
    return this.gaps.reduce((a, b) => a + b, 0) / this.gaps.length;
  }

  getMissedAlpha(): number {
    return this.gaps.filter(g => g > 0).reduce((a, b) => a + b, 0);
  }

  reset(): void { this.gaps = []; }
}

export const realizedVsExpected = new RealizedVsExpectedTracker();
