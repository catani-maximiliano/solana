import { AdversarialScore, CrowdingLevel } from "./types";
import { competitionEngine } from "./competitionEngine";
import { estimateFrontrunRisk } from "./frontrunRisk";
import { estimateBundleLikelihood } from "./bundleLikelihood";
import { classifyCrowding } from "./opportunityCrowding";
import { simulateRace } from "./executionRaceModel";
import { computeAdversarialScore } from "./adversarialScorer";
import { logInfo, logSuccess, logDebug } from "../../logger";

export interface AdversarialInput {
  pair: string;
  pool: string;
  spreadBps: number;
  isCrossDex: boolean;
  ourLatencyMs: number;
  avgBotLatencyMs: number;
  timingQuality: number;
  volatility: string;
}

export function analyzeAdversarial(input: AdversarialInput): AdversarialScore {
  // 1. Competition density
  const competition = competitionEngine.estimate(input.pair, input.spreadBps);

  // 2. Frontrun risk
  const frontrun = estimateFrontrunRisk(input.pool, input.spreadBps);

  // 3. Bundle likelihood
  const bundle = estimateBundleLikelihood(input.spreadBps, input.volatility);

  // 4. Crowding
  const crowding = classifyCrowding(competition.estimatedBots, input.spreadBps, input.pair, input.isCrossDex);

  // 5. Race simulation
  const race = simulateRace(competition.estimatedBots, input.ourLatencyMs, input.avgBotLatencyMs, input.timingQuality, bundle.probability);

  // 6. Composite score
  const score = computeAdversarialScore(competition, frontrun, bundle, crowding, race);

  logInfo(`[ADVERSARIAL] ${input.pair} bots=${competition.estimatedBots} density=${competition.density} crowding=${crowding} winProb=${(race.winProbability * 100).toFixed(0)}% advScore=${score.total}`);

  if (score.winProb < 30) {
    logDebug(`[ADVERSARIAL] ⚠️ Low win probability: ${score.winProb}% for ${input.pair}`);
  }

  return score;
}

export function logAdversarialSummary(stats: { totalAnalyzed: number; highRisk: number; avgWinProb: number }): void {
  logSuccess(`━━━━━━━━ [ADVERSARIAL] ──────────`);
  logInfo(`Searcher density: ${stats.totalAnalyzed} analyses`);
  logInfo(`Crowded opportunities: ${stats.highRisk}`);
  logInfo(`Avg win probability: ${(stats.avgWinProb).toFixed(0)}%`);
  logInfo(`High-risk executions avoided: ${stats.highRisk}`);
  logSuccess(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}
