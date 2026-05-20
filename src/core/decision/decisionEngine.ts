import { DecisionCandidate } from "./types";
import { scoreToxicity } from "./toxicityScorer";
import { estimateFillProbability } from "./fillProbability";
import { estimateSurvival } from "./executionSurvival";
import { computeExpectedValue } from "./expectedValue";
import { assessRisk } from "./riskEngine";
import { computeConfidence } from "./confidenceEngine";
import { computePriority } from "./executionPriority";
import { simulateExecution } from "./executionSimulator";
import { executionProfiler } from "./executionProfiler";
import { velocityTracker } from "../flow/velocityTracker";
import { volatilityWindow } from "../microstructure/volatilityWindow";
import { logInfo, logSuccess, logDebug } from "../../logger";

export interface DecisionInput {
  pair: string;
  route: string;
  pool: string;
  dex: string;
  grossBps: number;
  feesBps: number;
  liquidity: number;
  totalLatencyMs: number;
  persistenceScore: number;
}

/**
 * Full decision pipeline: toxicity → fill → survival → EV → risk → confidence → priority → simulate.
 */
export function makeDecision(input: DecisionInput): DecisionCandidate | null {
  const start = performance.now();

  // 1. Toxicity
  const toxicity = scoreToxicity(input.pool, input.pair);

  // 2. Fill probability
  const fillProb = estimateFillProbability(input.pair, input.liquidity, input.grossBps);

  // 3. Survival
  const survival = estimateSurvival(input.pair, input.pool);

  // 4. Expected value
  const ev = computeExpectedValue(input.grossBps, input.feesBps, 2, survival.expectedMs / 1000, fillProb, toxicity.score);

  // 5. Risk
  const vol = volatilityWindow.getSnapshot(input.pair);
  const risk = assessRisk(input.totalLatencyMs, input.liquidity, input.grossBps, toxicity.score, vol.regime);

  // 6. Confidence
  const confidence = computeConfidence(input.pair, input.pool);

  // 7. Priority
  const priority = computePriority(ev.net, survival.expectedMs, fillProb, confidence.overall, toxicity.level);

  // 8. Simulate
  const velocity = velocityTracker.getVelocity(input.pool);
  const sim = simulateExecution(input.grossBps, input.feesBps, input.liquidity, velocity, toxicity.score, input.totalLatencyMs, input.persistenceScore);

  // 9. Decision
  const shouldExecute = !sim.simCollapsed && ev.net > 0 && toxicity.level !== "TOXIC" && confidence.overall > 0.3 && risk.overall !== "HIGH";

  const candidate: DecisionCandidate = {
    pair: input.pair,
    route: input.route,
    score: priority,
    confidence: confidence.overall,
    expectedValue: ev.net,
    survivalMs: survival.expectedMs,
    fillProbability: fillProb,
    toxicity: toxicity.level,
    executionPriority: priority,
    shouldExecute,
  };

  const decisionMs = Math.round((performance.now() - start) * 10) / 10;
  executionProfiler.recordDecision(decisionMs);

  if (shouldExecute) {
    logSuccess(`[DECISION] ✅ ${input.pair} score=${priority} conf=${(confidence.overall * 100).toFixed(0)}% EV=${ev.net.toFixed(2)}bps survival=${survival.expectedMs}ms fill=${(fillProb * 100).toFixed(0)}% toxicity=${toxicity.level}`);
  } else {
    logDebug(`[DECISION] ⏸ ${input.pair} rejected: EV=${ev.net.toFixed(2)} toxicity=${toxicity.level} conf=${(confidence.overall * 100).toFixed(0)}% risk=${risk.overall} coll=${sim.simCollapsed}`);
  }

  return candidate;
}

export function logDecisionSummary(candidates: DecisionCandidate[]): void {
  const executable = candidates.filter(c => c.shouldExecute).sort((a, b) => b.executionPriority - a.executionPriority);
  if (executable.length === 0) return;
  logInfo(`━━━━━━━━ [DECISIONS] ──────────`);
  for (const c of executable.slice(0, 5)) {
    logInfo(`#${c.executionPriority} ${c.pair} EV=${c.expectedValue.toFixed(2)}bps conf=${(c.confidence * 100).toFixed(0)}% survival=${c.survivalMs}ms fill=${(c.fillProbability * 100).toFixed(0)}% ${c.toxicity}`);
  }
  logInfo(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}
