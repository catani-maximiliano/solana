import { StrategyVersion, ExperimentResult } from "./types";

export class StrategyVersioning {
  private versions: StrategyVersion[] = [];

  register(version: string, params: Record<string, number | string | boolean>): void {
    this.versions.push({ version, params, results: [], timestamp: Date.now() });
  }

  recordResult(version: string, result: ExperimentResult): void {
    const v = this.versions.find(v => v.version === version);
    if (v) v.results.push(result);
  }

  getLatest(): StrategyVersion | undefined { return this.versions[this.versions.length - 1]; }

  getAllVersions(): StrategyVersion[] { return this.versions; }

  getBestVersion(): { version: string; avgWinRate: number } | null {
    let best = null as { version: string; avgWinRate: number } | null;
    for (const v of this.versions) {
      if (v.results.length < 5) continue;
      const avg = v.results.reduce((s, r) => s + r.winRate, 0) / v.results.length;
      if (!best || avg > best.avgWinRate) best = { version: v.version, avgWinRate: Math.round(avg * 100) / 100 };
    }
    return best;
  }

  reset(): void { this.versions = []; }
}

export const strategyVersioning = new StrategyVersioning();
