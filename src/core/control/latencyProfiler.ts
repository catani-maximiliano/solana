import { PipelineLatency } from "./types";
import { logDebug } from "../../logger";

export class LatencyProfiler {
  private ingestionTimes: number[] = [];
  private routingTimes: number[] = [];
  private graphTimes: number[] = [];
  private decisionTimes: number[] = [];
  private timingTimes: number[] = [];

  recordIngestion(ms: number): void { this.ingestionTimes.push(ms); if (this.ingestionTimes.length > 500) this.ingestionTimes.shift(); }
  recordRouting(ms: number): void { this.routingTimes.push(ms); if (this.routingTimes.length > 500) this.routingTimes.shift(); }
  recordGraph(ms: number): void { this.graphTimes.push(ms); if (this.graphTimes.length > 500) this.graphTimes.shift(); }
  recordDecision(ms: number): void { this.decisionTimes.push(ms); if (this.decisionTimes.length > 500) this.decisionTimes.shift(); }
  recordTiming(ms: number): void { this.timingTimes.push(ms); if (this.timingTimes.length > 500) this.timingTimes.shift(); }

  avg(arr: number[]): number { return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }

  getPipelineLatency(): PipelineLatency {
    return {
      ingestionMs: Math.round(this.avg(this.ingestionTimes) * 100) / 100,
      routingMs: Math.round(this.avg(this.routingTimes) * 100) / 100,
      graphUpdateMs: Math.round(this.avg(this.graphTimes) * 100) / 100,
      decisionMs: Math.round(this.avg(this.decisionTimes) * 100) / 100,
      timingMs: Math.round(this.avg(this.timingTimes) * 100) / 100,
      totalMs: 0,
    };
  }

  getTotalMs(): number {
    const p = this.getPipelineLatency();
    return Math.round((p.ingestionMs + p.routingMs + p.graphUpdateMs + p.decisionMs + p.timingMs) * 100) / 100;
  }

  reset(): void { this.ingestionTimes = []; this.routingTimes = []; this.graphTimes = []; this.decisionTimes = []; this.timingTimes = []; }
}

export const latencyProfiler = new LatencyProfiler();
