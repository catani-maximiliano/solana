import { logInfo } from "../../logger";

export class LatencyImpactAnalyzer {
  private observations: { latencyMs: number; captureBps: number }[] = [];

  record(latencyMs: number, captureBps: number): void {
    this.observations.push({ latencyMs, captureBps });
    if (this.observations.length > 500) this.observations.shift();
  }

  getLeakagePerMs(): number {
    if (this.observations.length < 5) return 0;
    // Simple linear regression: how much capture drops per ms
    const meanLat = this.observations.reduce((s, o) => s + o.latencyMs, 0) / this.observations.length;
    const meanCap = this.observations.reduce((s, o) => s + o.captureBps, 0) / this.observations.length;
    let num = 0, den = 0;
    for (const o of this.observations) {
      num += (o.latencyMs - meanLat) * (o.captureBps - meanCap);
      den += (o.latencyMs - meanLat) ** 2;
    }
    return den > 0 ? Math.round((num / den) * 1000) / 1000 : 0;
  }

  printReport(): void {
    logInfo(`[LATENCY_IMPACT] Leakage per ms: ${this.getLeakagePerMs().toFixed(3)}bps`);
  }

  reset(): void { this.observations = []; }
}

export const latencyImpactAnalyzer = new LatencyImpactAnalyzer();
