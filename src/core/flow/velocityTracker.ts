import { logDebug } from "../../logger";

interface Tick {
  time: number;
  volume: number;
}

const VELOCITY_WINDOWS = [1000, 5000, 30000];

export class VelocityTracker {
  private history = new Map<string, Tick[]>();

  record(pool: string, volume: number): void {
    const now = Date.now();
    const ticks = this.history.get(pool) || [];
    ticks.push({ time: now, volume });
    this.history.set(pool, ticks.slice(-200));
  }

  /** Get velocity (volume per second) for a pool over a window */
  getVelocity(pool: string, windowMs = 5000): number {
    const ticks = this.history.get(pool) || [];
    const cutoff = Date.now() - windowMs;
    const recent = ticks.filter(t => t.time >= cutoff);
    if (recent.length < 2) return 0;
    const totalVolume = recent.reduce((s, t) => s + t.volume, 0);
    const elapsed = (recent[recent.length - 1].time - recent[0].time) / 1000;
    return elapsed > 0 ? totalVolume / elapsed : 0;
  }

  /** Get acceleration (change in velocity) */
  getAcceleration(pool: string): number {
    const v1 = this.getVelocity(pool, 1000);
    const v5 = this.getVelocity(pool, 5000);
    if (v5 <= 0) return 0;
    return (v1 - v5) / v5;
  }

  /** Get trade frequency (trades per second) */
  getFrequency(pool: string): number {
    const ticks = this.history.get(pool) || [];
    const cutoff = Date.now() - 5000;
    const recent = ticks.filter(t => t.time >= cutoff);
    return recent.length / 5;
  }

  /** Detect volume spike (>2x normal) */
  hasVolumeSpike(pool: string): boolean {
    const v1 = this.getVelocity(pool, 1000);
    const v30 = this.getVelocity(pool, 30000);
    return v30 > 0 && v1 > v30 * 2;
  }

  reset(): void { this.history.clear(); }
}

export const velocityTracker = new VelocityTracker();
