import { MakerTakerFlow } from "./types";
import { logDebug } from "../../logger";

interface FillRecord {
  time: number;
  isMaker: boolean;
  isBuy: boolean;
  volume: number;
}

const HISTORY_SIZE = 200;

export class MakerTakerAnalyzer {
  private fills = new Map<string, FillRecord[]>();

  recordFill(market: string, isMaker: boolean, isBuy: boolean, volume: number): void {
    const list = this.fills.get(market) || [];
    list.push({ time: Date.now(), isMaker, isBuy, volume });
    this.fills.set(market, list.slice(-HISTORY_SIZE));
  }

  analyze(market: string): MakerTakerFlow {
    const list = this.fills.get(market) || [];
    const cutoff = Date.now() - 5000;
    const recent = list.filter(f => f.time >= cutoff);

    const makerVolume = recent.filter(f => f.isMaker).reduce((s, f) => s + f.volume, 0);
    const takerVolume = recent.filter(f => !f.isMaker).reduce((s, f) => s + f.volume, 0);
    const total = makerVolume + takerVolume;

    const takerRatio = total > 0 ? takerVolume / total : 0.5;

    const aggBuy = recent.filter(f => !f.isMaker && f.isBuy).reduce((s, f) => s + f.volume, 0);
    const aggSell = recent.filter(f => !f.isMaker && !f.isBuy).reduce((s, f) => s + f.volume, 0);
    const aggTotal = aggBuy + aggSell;

    const aggressiveBuyPct = aggTotal > 0 ? aggBuy / aggTotal : 0.5;
    const aggressiveSellPct = aggTotal > 0 ? aggSell / aggTotal : 0.5;

    const absorption = takerRatio < 0.4 && recent.length > 10;

    if (takerRatio > 0.7) logDebug(`[TAKER] ${market} taker=${(takerRatio * 100).toFixed(0)}% aggressiveBuy=${(aggressiveBuyPct * 100).toFixed(0)}%`);

    return {
      market,
      makerVolume: Math.round(makerVolume * 100) / 100,
      takerVolume: Math.round(takerVolume * 100) / 100,
      takerRatio: Math.round(takerRatio * 100) / 100,
      aggressiveBuyPct: Math.round(aggressiveBuyPct * 100) / 100,
      aggressiveSellPct: Math.round(aggressiveSellPct * 100) / 100,
      absorption,
    };
  }

  reset(): void { this.fills.clear(); }
}

export const makerTakerAnalyzer = new MakerTakerAnalyzer();
