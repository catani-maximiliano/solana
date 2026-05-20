import { PipelineLatency } from "./types";

export class LatencyArbitrageProfiler {
  private latencies: number[] = [];
  private decodeTimes: number[] = [];
  private graphTimes: number[] = [];
  private decisionTimes: number[] = [];
  private buildTimes: number[] = [];
  private serializationTimes: number[] = [];

  recordIngest(ms: number): void { this.latencies.push(ms); if (this.latencies.length > 500) this.latencies.shift(); }
  recordDecode(ms: number): void { this.decodeTimes.push(ms); if (this.decodeTimes.length > 500) this.decodeTimes.shift(); }
  recordGraph(ms: number): void { this.graphTimes.push(ms); if (this.graphTimes.length > 500) this.graphTimes.shift(); }
  recordDecision(ms: number): void { this.decisionTimes.push(ms); if (this.decisionTimes.length > 500) this.decisionTimes.shift(); }
  recordBuild(ms: number): void { this.buildTimes.push(ms); if (this.buildTimes.length > 500) this.buildTimes.shift(); }
  recordSerialization(ms: number): void { this.serializationTimes.push(ms); if (this.serializationTimes.length > 500) this.serializationTimes.shift(); }

  avg(arr: number[]): number { return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }

  getPipelineLatency(): PipelineLatency {
    return {
      ingestMs: Math.round(this.avg(this.latencies) * 100) / 100,
      decodeMs: Math.round(this.avg(this.decodeTimes) * 100) / 100,
      graphMs: Math.round(this.avg(this.graphTimes) * 100) / 100,
      decisionMs: Math.round(this.avg(this.decisionTimes) * 100) / 100,
      bundleBuildMs: Math.round(this.avg(this.buildTimes) * 100) / 100,
      serializationMs: Math.round(this.avg(this.serializationTimes) * 100) / 100,
      relaySendMs: 0,
      inclusionMs: 0,
      totalMs: 0,
    };
  }

  getTotalMs(): number {
    const p = this.getPipelineLatency();
    return Math.round((p.ingestMs + p.decodeMs + p.graphMs + p.decisionMs + p.bundleBuildMs + p.serializationMs) * 100) / 100;
  }

  reset(): void { this.latencies = []; this.decodeTimes = []; this.graphTimes = []; this.decisionTimes = []; this.buildTimes = []; this.serializationTimes = []; }
}

export const latencyArbitrageProfiler = new LatencyArbitrageProfiler();
