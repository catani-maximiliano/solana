import { ShadowExecution, ShadowOutcome, TimingComparison, StrategyEvaluation } from "./types";
import { shadowExecutor } from "./shadowExecutor";
import { evaluateOutcome } from "./outcomeEvaluator";
import { alphaLeakageTracker } from "./alphaLeakageTracker";
import { missedOpportunityTracker } from "./missedOpportunityTracker";
import { logInfo, logSuccess } from "../../logger";

export class ShadowEngine {
  /** Execute in shadow mode: record + evaluate outcome */
  execute(
    pair: string,
    slot: number,
    expectedBps: number,
    expectedProfit: number,
    timing: TimingComparison,
    latencyMs: number,
    realizedBps: number,
    realizedProfit: number,
    spreadCollapsed: boolean,
    falsePositive: boolean,
    features: Record<string, number>,
  ): ShadowOutcome {
    const outcome = evaluateOutcome(expectedBps, realizedBps, expectedProfit, realizedProfit, spreadCollapsed, falsePositive);

    shadowExecutor.record(pair, slot, expectedBps, expectedProfit, timing, latencyMs, features);
    shadowExecutor.updateLast(realizedBps, realizedProfit, outcome);
    alphaLeakageTracker.record(expectedBps, realizedBps);

    if (outcome === "FALSE_POSITIVE" || outcome === "MISSED_ALPHA") {
      missedOpportunityTracker.record(pair, expectedBps, outcome);
    }

    logInfo(`[SHADOW] ${pair} expected=+${expectedBps.toFixed(1)}bps realized=+${realizedBps.toFixed(1)}bps captured=+${realizedBps.toFixed(1)}bps decision=${timing} outcome=${outcome}`);

    return outcome;
  }

  /** Get shadow summary */
  getSummary(): { winRate: number; total: number; outcomes: Record<string, number> } {
    const all = shadowExecutor.getAll();
    const outcomes: Record<string, number> = {};
    for (const e of all) {
      outcomes[e.outcome] = (outcomes[e.outcome] || 0) + 1;
    }
    return {
      winRate: Math.round(shadowExecutor.getWinRate() * 100),
      total: all.length,
      outcomes,
    };
  }

  printReport(): void {
    const s = this.getSummary();
    logSuccess(`━━━━━━━━ [SHADOW ENGINE] ──────────`);
    logInfo(`Shadow executions: ${s.total}`);
    logInfo(`Win rate: ${s.winRate}%`);
    for (const [k, v] of Object.entries(s.outcomes)) {
      logInfo(`  ${k}: ${v}`);
    }
    logInfo(`Missed alpha: ${missedOpportunityTracker.getMissedAlpha().toFixed(1)}bps`);
    logInfo(`Avg latency leakage: ${alphaLeakageTracker.getAvgLeakageBps().toFixed(1)}bps`);
    logSuccess(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  reset(): void {
    shadowExecutor.reset();
    alphaLeakageTracker.reset();
    missedOpportunityTracker.reset();
  }
}

export const shadowEngine = new ShadowEngine();
