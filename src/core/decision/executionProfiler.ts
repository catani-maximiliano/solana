import { ExecutionProfile } from "./types";

export class ExecutionProfiler {
  private detectionTimes: number[] = [];
  private decisionTimes: number[] = [];

  recordDetection(durationMs: number): void {
    this.detectionTimes.push(durationMs);
    if (this.detectionTimes.length > 200) this.detectionTimes.shift();
  }

  recordDecision(durationMs: number): void {
    this.decisionTimes.push(durationMs);
    if (this.decisionTimes.length > 200) this.decisionTimes.shift();
  }

  getProfile(): ExecutionProfile {
    const avgDetection = this.detectionTimes.length > 0
      ? this.detectionTimes.reduce((a, b) => a + b, 0) / this.detectionTimes.length
      : 0;
    const avgDecision = this.decisionTimes.length > 0
      ? this.decisionTimes.reduce((a, b) => a + b, 0) / this.decisionTimes.length
      : 0;

    return {
      detectionLatencyMs: Math.round(avgDetection * 10) / 10,
      decisionLatencyMs: Math.round(avgDecision * 10) / 10,
      totalInternalLatencyMs: Math.round((avgDetection + avgDecision) * 10) / 10,
    };
  }

  reset(): void { this.detectionTimes = []; this.decisionTimes = []; }
}

export const executionProfiler = new ExecutionProfiler();
