import { RelayPerformance } from "./types";

export class RelayPerformanceTracker {
  private relays = new Map<string, { latencies: number[]; inclusions: number; failures: number }>();

  record(relay: string, latencyMs: number, included: boolean): void {
    const r = this.relays.get(relay) || { latencies: [], inclusions: 0, failures: 0 };
    r.latencies.push(latencyMs);
    if (r.latencies.length > 100) r.latencies.shift();
    if (included) r.inclusions++;
    else r.failures++;
    this.relays.set(relay, r);
  }

  getRankings(): RelayPerformance[] {
    const result: RelayPerformance[] = [];
    for (const [name, r] of this.relays) {
      const total = r.inclusions + r.failures;
      const avgLat = r.latencies.length > 0 ? r.latencies.reduce((a, b) => a + b, 0) / r.latencies.length : 0;
      result.push({
        name,
        latencyMs: Math.round(avgLat),
        inclusionRate: total > 0 ? Math.round(r.inclusions / total * 100) : 0,
        failureRate: total > 0 ? Math.round(r.failures / total * 100) : 0,
        score: Math.round(Math.max(0, (r.inclusions / Math.max(1, total)) * 100 - avgLat * 0.5)),
      });
    }
    return result.sort((a, b) => b.score - a.score);
  }

  getBestRelay(): string {
    const rankings = this.getRankings();
    return rankings.length > 0 ? rankings[0].name : "none";
  }

  reset(): void { this.relays.clear(); }
}

export const relayPerformanceTracker = new RelayPerformanceTracker();
