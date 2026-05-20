import { ExecutionRaceResult } from "./types";

export function simulateRace(
  estimatedBots: number,
  ourLatencyMs: number,
  avgBotLatencyMs: number,
  timingQuality: number,
  bundleProbability: number,
): ExecutionRaceResult {
  // Latency advantage: negative = we're faster
  const latencyAdvantage = avgBotLatencyMs - ourLatencyMs;

  // Competition penalty: more bots = lower win prob
  const competitionPenalty = Math.min(0.8, estimatedBots * 0.05);

  // Base win probability from latency
  let winProb = 0.5;

  if (latencyAdvantage > 0) winProb += Math.min(0.3, latencyAdvantage / 100 * 0.3);
  if (latencyAdvantage < 0) winProb -= Math.min(0.3, Math.abs(latencyAdvantage) / 100 * 0.3);

  // Timing quality bonus
  winProb += timingQuality * 0.1;

  // Competition penalty
  winProb -= competitionPenalty;

  // Bundle penalty
  winProb -= bundleProbability * 0.3;

  // Slot position (simplified: random for now)
  const slotPosition = Math.round(Math.random() * 100);

  winProb = Math.max(0.01, Math.min(0.99, winProb));

  return {
    winProbability: Math.round(winProb * 100) / 100,
    latencyAdvantage: Math.round(latencyAdvantage),
    competitionPenalty: Math.round(competitionPenalty * 100) / 100,
    slotPosition,
  };
}
