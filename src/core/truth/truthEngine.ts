import { TrackedOpportunity, SurvivalAtLatency, TruthReport } from "./types";
import { opportunityTracker } from "./opportunityTracker";
import { spreadDecayTracker } from "./spreadDecayTracker";
import { opportunityLifetime } from "./opportunityLifetime";
import { falsePositiveTracker } from "./falsePositiveTracker";
import { calibrationEngine } from "./calibrationEngine";
import { logInfo, logSuccess } from "../../logger";

export class TruthEngine {
  /** Track an opportunity from detection to death */
  trackOpportunity(
    pair: string,
    dexes: string[],
    initialGross: number,
    initialNet: number,
    finalGross: number,
    lifetimeMs: number,
    wasExecutable: boolean,
  ): void {
    // Track
    opportunityTracker.record(pair, dexes, initialGross, initialNet);
    opportunityLifetime.record(lifetimeMs);
    spreadDecayTracker.record(pair, initialGross, finalGross, lifetimeMs);
    falsePositiveTracker.record(lifetimeMs, wasExecutable);

    const decay = (finalGross - initialGross) / Math.max(1, lifetimeMs);
    calibrationEngine.record(!wasExecutable, decay, wasExecutable ? 0.6 : 0.2);

    // Simulate survival at different latencies
    const at50 = initialNet + decay * 50 > 0;
    const at250 = initialNet + decay * 250 > 0;
    const at500 = initialNet + decay * 500 > 0;

    logInfo(`[TRUTH] ${pair} lifetime=${lifetimeMs}ms decay=${(decay * 1000).toFixed(1)}bps/s exec=${wasExecutable} @50=${at50} @250=${at250} @500=${at500}`);
  }

  /** Get full truth report */
  getReport(): TruthReport {
    const cal = calibrationEngine.calibrate();
    const fp = falsePositiveTracker.getReport();
    const total = opportunityTracker.count;

    return {
      opportunitiesTracked: total,
      medianLifetimeMs: opportunityLifetime.getMedian(),
      p95LifetimeMs: opportunityLifetime.getP95(),
      falsePositives: fp.total > 0 ? Math.round(fp.diedBefore100ms / fp.total * 100) : 0,
      survivalAt100ms: total > 0 ? Math.round((total - fp.diedBefore100ms) / total * 100) : 0,
      survivalAt250ms: total > 0 ? Math.round((total - fp.diedBefore250ms) / total * 100) : 0,
      survivalAt500ms: total > 0 ? Math.round((total - fp.diedBefore500ms) / total * 100) : 0,
      avgDecay: Math.round(spreadDecayTracker.getAverageDecay() * 1000 * 100) / 100,
      executableRate: total > 0 ? Math.round((total - fp.neverExecutable) / total * 100) : 0,
    };
  }

  /** Print truth dashboard */
  printReport(): void {
    const r = this.getReport();
    logSuccess(`━━━━━━━━ [TRUTH ENGINE] ──────────`);
    logInfo(`Opportunities tracked: ${r.opportunitiesTracked}`);
    logInfo(`Median lifetime: ${r.medianLifetimeMs}ms | P95: ${r.p95LifetimeMs}ms`);
    logInfo(`False positives: ${r.falsePositives}%`);
    logInfo(`Survival @100ms: ${r.survivalAt100ms}% | @250ms: ${r.survivalAt250ms}% | @500ms: ${r.survivalAt500ms}%`);
    logInfo(`Avg decay: ${r.avgDecay}bps/s`);
    logInfo(`Executable rate: ${r.executableRate}%`);
    logSuccess(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  reset(): void {
    opportunityTracker.reset();
    spreadDecayTracker.reset();
    opportunityLifetime.reset();
    falsePositiveTracker.reset();
    calibrationEngine.reset();
  }
}

export const truthEngine = new TruthEngine();
