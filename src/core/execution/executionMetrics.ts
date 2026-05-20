import { ExecutionMetrics } from "./types";

export class ExecutionMetricsTracker {
  private buildTimes: number[] = [];
  private serializationTimes: number[] = [];
  private routeTimes: number[] = [];
  private totalPlanTimes: number[] = [];

  recordBuild(ms: number): void { this.buildTimes.push(ms); if (this.buildTimes.length > 100) this.buildTimes.shift(); }
  recordSerialization(ms: number): void { this.serializationTimes.push(ms); if (this.serializationTimes.length > 100) this.serializationTimes.shift(); }
  recordRoute(ms: number): void { this.routeTimes.push(ms); if (this.routeTimes.length > 100) this.routeTimes.shift(); }
  recordTotal(ms: number): void { this.totalPlanTimes.push(ms); if (this.totalPlanTimes.length > 100) this.totalPlanTimes.shift(); }

  getAverage(): ExecutionMetrics {
    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    return {
      buildLatencyMs: Math.round(avg(this.buildTimes) * 10) / 10,
      serializationLatencyMs: Math.round(avg(this.serializationTimes) * 10) / 10,
      routeLatencyMs: Math.round(avg(this.routeTimes) * 10) / 10,
      estimatedLandingSlot: 0,
      expectedConfirmationMs: 400,
      totalPlanMs: Math.round(avg(this.totalPlanTimes) * 10) / 10,
    };
  }

  reset(): void { this.buildTimes = []; this.serializationTimes = []; this.routeTimes = []; this.totalPlanTimes = []; }
}

export const executionMetricsTracker = new ExecutionMetricsTracker();
