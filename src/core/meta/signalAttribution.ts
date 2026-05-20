import { FeatureImportance, DecisionOutcome } from "./types";

export class SignalAttribution {
  private contributions = new Map<string, { successes: number; failures: number; totalScores: number[] }>();

  record(outcome: DecisionOutcome): void {
    for (const [signal, score] of Object.entries(outcome.features)) {
      const entry = this.contributions.get(signal) || { successes: 0, failures: 0, totalScores: [] };
      if (outcome.wasSuccessful) entry.successes++;
      else entry.failures++;
      entry.totalScores.push(score);
      if (entry.totalScores.length > 500) entry.totalScores.shift();
      this.contributions.set(signal, entry);
    }
  }

  getImportance(): FeatureImportance[] {
    const result: FeatureImportance[] = [];
    for (const [signal, entry] of this.contributions) {
      const total = entry.successes + entry.failures;
      if (total < 5) continue;
      const rate = entry.successes / total;
      const avgScore = entry.totalScores.reduce((a, b) => a + b, 0) / entry.totalScores.length;
      const contribution = rate * avgScore;
      result.push({
        signal,
        contribution: Math.round(contribution * 100) / 100,
        direction: rate > 0.5 ? "POSITIVE" : "NEGATIVE",
        confidence: Math.round(Math.min(1, total / 50) * 100) / 100,
      });
    }
    return result.sort((a, b) => b.contribution - a.contribution);
  }

  reset(): void { this.contributions.clear(); }
}

export const signalAttribution = new SignalAttribution();
