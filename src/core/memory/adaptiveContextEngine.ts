import { AdaptiveContext } from "./types";
import { marketMemory } from "./marketMemory";
import { toxicPoolRegistry } from "./toxicPoolRegistry";
import { contextWindow } from "./contextWindow";
import { logInfo } from "../../logger";

export function getAdaptiveContext(pair: string, pool: string): AdaptiveContext {
  const mem = marketMemory.getPair(pair);
  const toxicity = toxicPoolRegistry.getToxicity(pool);
  const window = contextWindow.getWindow(5000);

  let confidenceBoost = 0;
  let aggressiveness = 0.5;
  let recommendedTiming = "WAIT_100MS";
  let toxicityPenalty = 0;

  // Boost from historical win rate
  if (mem && mem.totalObservations > 10) {
    if (mem.winRate > 0.6) confidenceBoost = 0.15;
    if (mem.winRate > 0.75) confidenceBoost = 0.25;
    recommendedTiming = mem.bestTiming;
  }

  // Boost from regime alignment
  if (mem) {
    const bestRegime = marketMemory.getBestRegime(pair);
    if (bestRegime === window.currentRegime) confidenceBoost += 0.1;
  }

  // High vol = more aggressive
  if (window.currentRegime === "HIGH_VOL") aggressiveness = 0.7;
  else if (window.currentRegime === "LOW_VOL") aggressiveness = 0.3;

  // Toxicity penalty
  if (toxicity === "HIGH") { toxicityPenalty = 0.4; aggressiveness = 0.2; }
  else if (toxicity === "MEDIUM") { toxicityPenalty = 0.2; aggressiveness = 0.4; }

  return {
    confidenceBoost: Math.round(confidenceBoost * 100) / 100,
    aggressiveness: Math.round(aggressiveness * 100) / 100,
    recommendedTiming,
    toxicityPenalty: Math.round(toxicityPenalty * 100) / 100,
  };
}

export function logAdaptiveContext(pair: string, pool: string): void {
  const ctx = getAdaptiveContext(pair, pool);
  logInfo(`[MEMORY] ${pair} regime=${contextWindow.getWindow(5000).currentRegime} confBoost=+${(ctx.confidenceBoost * 100).toFixed(0)}% timing=${ctx.recommendedTiming} aggress=${(ctx.aggressiveness * 100).toFixed(0)}%`);
}
