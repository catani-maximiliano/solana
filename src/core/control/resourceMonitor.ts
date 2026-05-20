import { ResourceUsage } from "./types";

const MAX_EVENT_BACKLOG = 1000;
const MAX_PROCESSING_LATENCY = 100;

export class ResourceMonitor {
  private eventBacklog = 0;
  private processingLatencies: number[] = [];

  recordBacklog(size: number): void { this.eventBacklog = size; }
  recordProcessingLatency(ms: number): void { this.processingLatencies.push(ms); if (this.processingLatencies.length > 100) this.processingLatencies.shift(); }

  getUsage(): ResourceUsage {
    const avgLat = this.processingLatencies.length > 0
      ? this.processingLatencies.reduce((a, b) => a + b, 0) / this.processingLatencies.length
      : 0;
    return { cpuPercent: 0, memoryMb: 0, eventBacklog: this.eventBacklog, processingLatencyMs: Math.round(avgLat * 10) / 10 };
  }

  isOverloaded(): boolean {
    const u = this.getUsage();
    return u.eventBacklog > MAX_EVENT_BACKLOG || u.processingLatencyMs > MAX_PROCESSING_LATENCY;
  }

  reset(): void { this.eventBacklog = 0; this.processingLatencies = []; }
}

export const resourceMonitor = new ResourceMonitor();
