import { ExecutionPlan } from "./types";

export class ExecutionState {
  private history: ExecutionPlan[] = [];
  private lastSend = 0;

  recordPlan(plan: ExecutionPlan): void {
    this.history.push(plan);
    if (this.history.length > 200) this.history.shift();
  }

  shouldSend(simulatedIntervalMs = 500): boolean {
    return Date.now() - this.lastSend >= simulatedIntervalMs;
  }

  markSent(): void { this.lastSend = Date.now(); }

  getRecent(n = 10): ExecutionPlan[] { return this.history.slice(-n); }

  getStats() {
    const planned = this.history.filter(p => p.shouldSend).length;
    return { totalPlans: this.history.length, wouldExecute: planned, dryRun: true };
  }

  reset(): void { this.history = []; this.lastSend = 0; }
}

export const executionState = new ExecutionState();
