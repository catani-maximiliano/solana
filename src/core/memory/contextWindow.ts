import { ContextWindow } from "./types";

export class ContextWindowTracker {
  private spreads: number[] = [];
  private timestamps: number[] = [];

  record(spreadBps: number): void {
    this.spreads.push(spreadBps);
    this.timestamps.push(Date.now());
    if (this.spreads.length > 10000) { this.spreads.shift(); this.timestamps.shift(); }
  }

  getWindow(windowMs: number): ContextWindow {
    const now = Date.now();
    const cutoff = now - windowMs;
    const indices: number[] = [];
    for (let i = this.timestamps.length - 1; i >= 0; i--) {
      if (this.timestamps[i] >= cutoff) indices.unshift(i);
    }
    const values = indices.map(i => this.spreads[i]);
    const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    return { spreads1s: this.getRecent(1), spreads5s: this.getRecent(5), spreads30s: this.getRecent(30), spreads5m: this.getRecent(300), currentRegime: avg > 10 ? "HIGH_VOL" : avg > 3 ? "MEDIUM_VOL" : "LOW_VOL" };
  }

  private getRecent(seconds: number): number[] {
    const cutoff = Date.now() - seconds * 1000;
    const result: number[] = [];
    for (let i = this.timestamps.length - 1; i >= 0; i--) {
      if (this.timestamps[i] >= cutoff) result.unshift(this.spreads[i]);
    }
    return result;
  }

  reset(): void { this.spreads = []; this.timestamps = []; }
}

export const contextWindow = new ContextWindowTracker();
