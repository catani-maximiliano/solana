import { ExecutionMetrics } from "./types";

export class ExecutionProfiler {
  private phases: { name: string; time: number }[] = [];

  start(): void { this.phases = []; this.phase("start"); }

  phase(name: string): void { this.phases.push({ name, time: performance.now() }); }

  getReport(): { phases: { name: string; ms: number }[]; totalMs: number } {
    const phases = this.phases.map((p, i) => {
      const prev = i > 0 ? this.phases[i - 1].time : this.phases[0].time;
      return { name: p.name, ms: Math.round((p.time - prev) * 100) / 100 };
    });
    const totalMs = Math.round((this.phases[this.phases.length - 1]?.time || 0 - this.phases[0]?.time || 0) * 100) / 100;
    return { phases, totalMs };
  }

  getTotalMs(): number {
    if (this.phases.length < 2) return 0;
    return Math.round((this.phases[this.phases.length - 1].time - this.phases[0].time) * 100) / 100;
  }

  reset(): void { this.phases = []; }
}

export const executionProfiler = new ExecutionProfiler();
