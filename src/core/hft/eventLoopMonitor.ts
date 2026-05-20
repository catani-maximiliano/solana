import { logWarning } from "../../logger";

const TICK_THRESHOLD_MS = 10;

export class EventLoopMonitor {
  private lastTick = Date.now();
  private slowTicks = 0;

  /** Call on each event loop tick */
  tick(): void {
    const now = Date.now();
    const elapsed = now - this.lastTick;
    if (elapsed > TICK_THRESHOLD_MS) {
      this.slowTicks++;
      logWarning(`[EVENT_LOOP] Slow tick: ${elapsed}ms (threshold ${TICK_THRESHOLD_MS}ms) — count: ${this.slowTicks}`);
    }
    this.lastTick = now;
  }

  getSlowTickCount(): number { return this.slowTicks; }

  reset(): void { this.lastTick = Date.now(); this.slowTicks = 0; }
}

export const eventLoopMonitor = new EventLoopMonitor();
