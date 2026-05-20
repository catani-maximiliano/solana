import { ExperimentConfig, ExperimentResult } from "./types";

export class ExperimentManager {
  private experiments: ExperimentConfig[] = [];
  private results = new Map<string, ExperimentResult[]>();

  register(config: ExperimentConfig): void {
    this.experiments.push(config);
    this.results.set(config.id, []);
  }

  recordResult(experimentId: string, result: ExperimentResult): void {
    const list = this.results.get(experimentId) || [];
    list.push(result);
    this.results.set(experimentId, list);
  }

  getExperiments(): ExperimentConfig[] { return this.experiments; }

  getBestExperiment(): { id: string; avgScore: number } | null {
    let best = null as { id: string; avgScore: number } | null;
    for (const [id, results] of this.results) {
      if (results.length < 5) continue;
      const avgScore = results.reduce((s, r) => s + r.winRate * 0.4 + r.realityScore * 0.3 + (1 - r.falsePositiveRate) * 0.3, 0) / results.length;
      if (!best || avgScore > best.avgScore) best = { id, avgScore: Math.round(avgScore * 100) / 100 };
    }
    return best;
  }

  reset(): void { this.experiments = []; this.results.clear(); }
}

export const experimentManager = new ExperimentManager();
