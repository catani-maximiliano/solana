import { CompetitionEstimate } from "./types";
import { logDebug } from "../../logger";

export class CompetitionEngine {
  private recentCompetition = new Map<string, number[]>();

  /** Record a competitive event for a pair */
  record(pair: string): void {
    const list = this.recentCompetition.get(pair) || [];
    list.push(Date.now());
    this.recentCompetition.set(pair, list.slice(-100));
  }

  /** Estimate number of competing bots for a pair */
  estimate(pair: string, spreadBps: number): CompetitionEstimate {
    const now = Date.now();
    const recent = (this.recentCompetition.get(pair) || []).filter(t => now - t < 60_000);
    const events = recent.length;

    // Base: more events = more bots
    let botEstimate = Math.max(1, Math.round(events / 5));

    // Higher spreads attract more bots
    if (spreadBps > 30) botEstimate = Math.round(botEstimate * 1.5);
    if (spreadBps > 50) botEstimate = Math.round(botEstimate * 2);

    // Known competitive pairs
    const popularPairs = ["SOL/USDC", "SOL/USDT", "SOL/WIF", "SOL/JUP"];
    if (popularPairs.includes(pair)) botEstimate = Math.round(botEstimate * 1.3);

    let density: "LOW" | "MEDIUM" | "HIGH" = "LOW";
    if (botEstimate > 15) density = "HIGH";
    else if (botEstimate > 5) density = "MEDIUM";

    const confidence = Math.min(1, events / 20);

    if (density !== "LOW") {
      logDebug(`[COMPETITION] ${pair} density=${density} estimatedBots=${botEstimate}`);
    }

    return { estimatedBots: botEstimate, density, confidence: Math.round(confidence * 100) / 100 };
  }

  reset(): void { this.recentCompetition.clear(); }
}

export const competitionEngine = new CompetitionEngine();
