import { logDebug } from "../../logger";

export class SpreadDecayTracker {
  private decays: number[] = [];

  record(pair: string, initialBps: number, finalBps: number, elapsedMs: number): void {
    if (elapsedMs <= 0) return;
    const decay = (finalBps - initialBps) / elapsedMs; // bps per ms
    this.decays.push(decay);
    if (this.decays.length > 1000) this.decays.shift();
    logDebug(`[DECAY] ${pair} ${initialBps.toFixed(1)}→${finalBps.toFixed(1)}bps in ${elapsedMs}ms (${(decay * 1000).toFixed(2)}bps/s)`);
  }

  getAverageDecay(): number {
    if (this.decays.length === 0) return 0;
    return this.decays.reduce((a, b) => a + b, 0) / this.decays.length;
  }

  reset(): void { this.decays = []; }
}

export const spreadDecayTracker = new SpreadDecayTracker();
