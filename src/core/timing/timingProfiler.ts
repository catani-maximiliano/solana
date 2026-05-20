import { TimingProfile, TimingDecision } from "./types";
import { logInfo } from "../../logger";

export class TimingProfiler {
  private decisions: TimingDecision[] = [];
  private evImprovements: number[] = [];
  private mistimed = 0;

  record(decision: TimingDecision, evNow: number, evAtExecution: number): void {
    this.decisions.push(decision);
    this.evImprovements.push(evAtExecution - evNow);
    if (evAtExecution < evNow - 1) this.mistimed++; // waited but EV dropped >1bps
  }

  getProfile(): TimingProfile {
    const fireNow = this.decisions.filter(d => d === "FIRE_NOW").length;
    const wait50 = this.decisions.filter(d => d === "WAIT_50MS").length;
    const wait100 = this.decisions.filter(d => d === "WAIT_100MS").length;
    const wait250 = this.decisions.filter(d => d === "WAIT_250MS").length;
    const discard = this.decisions.filter(d => d === "DISCARD").length;
    const avgEV = this.evImprovements.length > 0
      ? this.evImprovements.reduce((a, b) => a + b, 0) / this.evImprovements.length
      : 0;

    return { fireNowCount: fireNow, wait50MsCount: wait50, wait100MsCount: wait100, wait250MsCount: wait250, discardCount: discard, avgEVImprovement: Math.round(avgEV * 100) / 100, mistimedCount: this.mistimed };
  }

  printProfile(): void {
    const p = this.getProfile();
    logInfo(`━━━━━━━━ [TIMING ENGINE] ──────────`);
    logInfo(`FIRE_NOW: ${p.fireNowCount} | WAIT_50MS: ${p.wait50MsCount} | WAIT_100MS: ${p.wait100MsCount} | WAIT_250MS: ${p.wait250MsCount} | DISCARD: ${p.discardCount}`);
    logInfo(`Avg delayed EV improvement: ${p.avgEVImprovement}bps`);
    logInfo(`Mistimed executions avoided: ${p.mistimedCount}`);
    logInfo(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  reset(): void { this.decisions = []; this.evImprovements = []; this.mistimed = 0; }
}

export const timingProfiler = new TimingProfiler();
