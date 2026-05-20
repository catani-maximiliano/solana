import { ShadowExecution, TimingComparison, ShadowOutcome } from "./types";

export class ShadowExecutor {
  private executions: ShadowExecution[] = [];

  /** Register a shadow execution */
  record(
    pair: string,
    slot: number,
    expectedNetBps: number,
    expectedProfitUsd: number,
    timingDecision: TimingComparison,
    latencyMs: number,
    features: Record<string, number>,
  ): void {
    this.executions.push({
      pair,
      timestamp: Date.now(),
      slot,
      expectedNetBps,
      realizedNetBps: 0,
      capturedNetBps: 0,
      expectedProfitUsd,
      realizedProfitUsd: 0,
      timingDecision,
      outcome: "FLAT",
      latencyMs,
      features,
    });
  }

  /** Update the most recent execution with realized outcomes */
  updateLast(realizedNetBps: number, realizedProfitUsd: number, outcome: ShadowOutcome): void {
    const last = this.executions[this.executions.length - 1];
    if (!last) return;
    last.realizedNetBps = realizedNetBps;
    last.realizedProfitUsd = realizedProfitUsd;
    last.capturedNetBps = realizedNetBps;
    last.outcome = outcome;
  }

  getAll(): ShadowExecution[] { return this.executions; }
  getCount(): number { return this.executions.length; }

  getWinRate(): number {
    if (this.executions.length === 0) return 0;
    const wins = this.executions.filter(e => e.outcome === "WIN" || e.outcome === "PARTIAL_WIN").length;
    return wins / this.executions.length;
  }

  reset(): void { this.executions = []; }
}

export const shadowExecutor = new ShadowExecutor();
