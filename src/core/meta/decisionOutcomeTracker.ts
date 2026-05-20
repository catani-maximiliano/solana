import { DecisionOutcome } from "./types";
import { signalAttribution } from "./signalAttribution";

export class DecisionOutcomeTracker {
  private outcomes: DecisionOutcome[] = [];
  private totalSuccesses = 0;
  private totalDecisions = 0;

  record(features: Record<string, number>, wasSuccessful: boolean, falsePositive: boolean, executionViable: boolean, regime: string): void {
    const outcome: DecisionOutcome = { features, wasSuccessful, falsePositive, executionViable, regime };
    this.outcomes.push(outcome);
    this.totalDecisions++;
    if (wasSuccessful) this.totalSuccesses++;
    signalAttribution.record(outcome);
  }

  getSuccessRate(): number {
    return this.totalDecisions > 0 ? this.totalSuccesses / this.totalDecisions : 0;
  }

  getRecent(n = 100): DecisionOutcome[] {
    return this.outcomes.slice(-n);
  }

  reset(): void { this.outcomes = []; this.totalSuccesses = 0; this.totalDecisions = 0; }
}

export const decisionOutcomeTracker = new DecisionOutcomeTracker();
