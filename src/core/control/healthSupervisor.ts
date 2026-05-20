import { HealthStatus } from "./types";
import { logInfo, logWarning } from "../../logger";

export class HealthSupervisor {
  private emergencyMode = false;
  private streamLastEvents = new Map<string, number>();
  private graphUpdateTimes: number[] = [];

  recordStreamEvent(stream: string): void { this.streamLastEvents.set(stream, Date.now()); }
  recordGraphUpdate(): void { this.graphUpdateTimes.push(Date.now()); if (this.graphUpdateTimes.length > 100) this.graphUpdateTimes.shift(); }

  check(): HealthStatus {
    const now = Date.now();
    let streamsHealthy = 0, streamsStalled = 0;

    for (const [, last] of this.streamLastEvents) {
      if (now - last < 30_000) streamsHealthy++;
      else streamsStalled++;
    }

    const lastGraphUpdate = this.graphUpdateTimes.length > 0 ? this.graphUpdateTimes[this.graphUpdateTimes.length - 1] : 0;
    const graphFrozen = lastGraphUpdate > 0 && now - lastGraphUpdate > 60_000;
    const eventLagMs = streamsStalled > 0 ? now - Math.max(...Array.from(this.streamLastEvents.values())) : 0;

    if (graphFrozen) logWarning("[HEALTH] Graph frozen — no updates for 60s");
    if (streamsStalled > streamsHealthy) logWarning(`[HEALTH] ${streamsStalled} streams stalled`);

    return { streamsHealthy, streamsStalled, graphFrozen, eventLagMs, replayDivergence: false, memoryLeak: false, emergencyMode: this.emergencyMode };
  }

  isHealthy(): boolean {
    const h = this.check();
    return !h.graphFrozen && h.streamsStalled === 0 && !h.emergencyMode;
  }

  setEmergency(v: boolean): void { this.emergencyMode = v; }
  reset(): void { this.streamLastEvents.clear(); this.graphUpdateTimes = []; this.emergencyMode = false; }
}

export const healthSupervisor = new HealthSupervisor();
