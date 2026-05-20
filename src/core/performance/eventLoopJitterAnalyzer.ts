import { EventLoopJitter } from "./types";
import { logWarning } from "../../logger";

export class EventLoopJitterAnalyzer {
  private tickTimes: number[] = [];
  private lastTick = Date.now();
  private slowTickCount = 0;

  tick(): void {
    const now = Date.now();
    const elapsed = now - this.lastTick;
    this.tickTimes.push(elapsed);
    if (this.tickTimes.length > 200) this.tickTimes.shift();
    if (elapsed > 5) this.slowTickCount++;
    this.lastTick = now;
  }

  getJitter(): EventLoopJitter {
    if (this.tickTimes.length === 0) return { avgJitterMs: 0, maxJitterMs: 0, slowTickCount: 0 };
    const avg = this.tickTimes.reduce((a, b) => a + b, 0) / this.tickTimes.length;
    const max = Math.max(...this.tickTimes);
    return {
      avgJitterMs: Math.round(avg * 100) / 100,
      maxJitterMs: Math.round(max * 100) / 100,
      slowTickCount: this.slowTickCount,
    };
  }

  reset(): void { this.tickTimes = []; this.lastTick = Date.now(); this.slowTickCount = 0; }
}

export const eventLoopJitterAnalyzer = new EventLoopJitterAnalyzer();
