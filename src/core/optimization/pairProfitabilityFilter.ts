import { PairProfitability } from "./types";
import { logInfo } from "../../logger";

export class PairProfitabilityFilter {
  private pairs = new Map<string, PairProfitability>();

  record(pair: string, won: boolean, returnBps: number, leakage: number): void {
    const p = this.pairs.get(pair) || { pair, totalTrades: 0, winRate: 0, avgReturnBps: 0, captureRate: 0, alphaLeakageBps: 0, enabled: true };
    p.totalTrades++;
    p.winRate = (p.winRate * (p.totalTrades - 1) + (won ? 1 : 0)) / p.totalTrades;
    p.avgReturnBps = (p.avgReturnBps * (p.totalTrades - 1) + returnBps) / p.totalTrades;
    p.alphaLeakageBps = (p.alphaLeakageBps * (p.totalTrades - 1) + leakage) / p.totalTrades;
    p.captureRate = 100 - p.alphaLeakageBps;
    // Auto-disable if negative EV or too few trades
    if (p.totalTrades > 10 && (p.avgReturnBps < 0 || p.captureRate < 10)) p.enabled = false;
    if (p.totalTrades > 20 && p.winRate < 0.3) p.enabled = false;
    this.pairs.set(pair, p);
  }

  isEnabled(pair: string): boolean { return this.pairs.get(pair)?.enabled ?? true; }

  getEnabledPairs(): string[] { return Array.from(this.pairs.values()).filter(p => p.enabled).map(p => p.pair); }

  getDisabledPairs(): string[] { return Array.from(this.pairs.values()).filter(p => !p.enabled).map(p => p.pair); }

  reset(): void { this.pairs.clear(); }
}

export const pairProfitabilityFilter = new PairProfitabilityFilter();
