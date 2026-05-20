import { RelayLatencySnapshot } from "./types";
import { logInfo } from "../../logger";

const REGIONS = ["frankfurt", "amsterdam", "tokyo", "ny"];

export class RegionOptimizer {
  private latencies = new Map<string, number[]>();

  record(region: string, latencyMs: number): void {
    const list = this.latencies.get(region) || [];
    list.push(latencyMs);
    if (list.length > 100) list.shift();
    this.latencies.set(region, list);
  }

  getBestRegion(): string {
    let best = REGIONS[0];
    let bestAvg = Infinity;
    for (const region of REGIONS) {
      const list = this.latencies.get(region) || [];
      if (list.length < 3) continue;
      const avg = list.reduce((a, b) => a + b, 0) / list.length;
      if (avg < bestAvg) { bestAvg = avg; best = region; }
    }
    return best;
  }

  getSnapshots(): RelayLatencySnapshot[] {
    return REGIONS.map(region => {
      const list = this.latencies.get(region) || [];
      const sorted = [...list].sort((a, b) => a - b);
      return {
        region,
        avgLatencyMs: list.length > 0 ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : 0,
        p50Ms: sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.5)] : 0,
        p95Ms: sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.95)] : 0,
        lastChecked: Date.now(),
      };
    });
  }

  printRanking(): void {
    const snapshots = this.getSnapshots().sort((a, b) => a.avgLatencyMs - b.avgLatencyMs);
    for (const s of snapshots) {
      logInfo(`  ${s.region.padEnd(12)} avg=${s.avgLatencyMs}ms p50=${s.p50Ms}ms p95=${s.p95Ms}ms`);
    }
  }

  reset(): void { this.latencies.clear(); }
}

export const regionOptimizer = new RegionOptimizer();
