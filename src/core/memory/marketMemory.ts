import { PairMemory, RegimeMemoryEntry } from "./types";

export class MarketMemory {
  private pairs = new Map<string, PairMemory>();

  record(pair: string, regimeName: string, survivalMs: number, decay: number, win: boolean, timing: string): void {
    const mem = this.pairs.get(pair) || {
      pair, totalObservations: 0, avgSurvivalMs: 0, avgDecay: 0, winRate: 0, bestTiming: "NEUTRAL", toxicityBias: "LOW", regimeMemory: {},
    };
    mem.totalObservations++;
    mem.avgSurvivalMs = (mem.avgSurvivalMs * (mem.totalObservations - 1) + survivalMs) / mem.totalObservations;
    mem.avgDecay = (mem.avgDecay * (mem.totalObservations - 1) + decay) / mem.totalObservations;

    if (win) mem.winRate = (mem.winRate * (mem.totalObservations - 1) + 1) / mem.totalObservations;

    const regimeEntry = mem.regimeMemory[regimeName] || { regimeName, observations: 0, winRate: 0, avgReturn: 0, bestTiming: "NEUTRAL" };
    regimeEntry.observations++;
    if (win) regimeEntry.winRate = (regimeEntry.winRate * (regimeEntry.observations - 1) + 1) / regimeEntry.observations;
    regimeEntry.avgReturn = (regimeEntry.avgReturn * (regimeEntry.observations - 1) + (win ? decay : 0)) / regimeEntry.observations;
    mem.regimeMemory[regimeName] = regimeEntry;

    this.pairs.set(pair, mem);
  }

  getPair(pair: string): PairMemory | undefined { return this.pairs.get(pair); }

  getBestRegime(pair: string): string {
    const mem = this.pairs.get(pair);
    if (!mem) return "UNKNOWN";
    let best = "";
    let bestRate = 0;
    for (const [, r] of Object.entries(mem.regimeMemory)) {
      if (r.winRate > bestRate) { best = r.regimeName; bestRate = r.winRate; }
    }
    return best || "UNKNOWN";
  }

  reset(): void { this.pairs.clear(); }
}

export const marketMemory = new MarketMemory();
