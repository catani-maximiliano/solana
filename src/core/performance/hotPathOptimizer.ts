import { CriticalPathMetrics } from "./types";

export class HotPathOptimizer {
  private decodeTimes: number[] = [];
  private graphTimes: number[] = [];
  private decisionTimes: number[] = [];
  private buildTimes: number[] = [];
  private serializeTimes: number[] = [];

  record(decodeMs: number, graphMs: number, decisionMs: number, buildMs: number, serializeMs: number): void {
    this.decodeTimes.push(decodeMs);
    this.graphTimes.push(graphMs);
    this.decisionTimes.push(decisionMs);
    this.buildTimes.push(buildMs);
    this.serializeTimes.push(serializeMs);
    for (const arr of [this.decodeTimes, this.graphTimes, this.decisionTimes, this.buildTimes, this.serializeTimes]) {
      if (arr.length > 500) arr.shift();
    }
  }

  getCriticalPath(): CriticalPathMetrics {
    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const p = (arr: number[], percentile: number) => {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length * percentile)];
    };
    const total = avg(this.decodeTimes) + avg(this.graphTimes) + avg(this.decisionTimes) + avg(this.buildTimes) + avg(this.serializeTimes);
    const allPoints = [...this.decodeTimes, ...this.graphTimes, ...this.decisionTimes, ...this.buildTimes, ...this.serializeTimes];
    return {
      decodeMs: Math.round(avg(this.decodeTimes) * 100) / 100,
      graphMs: Math.round(avg(this.graphTimes) * 100) / 100,
      decisionMs: Math.round(avg(this.decisionTimes) * 100) / 100,
      buildMs: Math.round(avg(this.buildTimes) * 100) / 100,
      serializeMs: Math.round(avg(this.serializeTimes) * 100) / 100,
      totalMs: Math.round(total * 100) / 100,
      p50Ms: Math.round(p(allPoints, 0.5) * 100) / 100,
      p95Ms: Math.round(p(allPoints, 0.95) * 100) / 100,
      p99Ms: Math.round(p(allPoints, 0.99) * 100) / 100,
    };
  }

  reset(): void { this.decodeTimes = []; this.graphTimes = []; this.decisionTimes = []; this.buildTimes = []; this.serializeTimes = []; }
}

export const hotPathOptimizer = new HotPathOptimizer();
