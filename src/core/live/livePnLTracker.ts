import { LiveTradeRecord, LiveStats } from "./types";
import { logInfo } from "../../logger";

export class LivePnLTracker {
  private trades: LiveTradeRecord[] = [];
  private bundlesWon = 0;
  private bundlesLost = 0;

  recordTrade(trade: LiveTradeRecord): void {
    this.trades.push(trade);
    if (trade.bundleWon) this.bundlesWon++;
    else this.bundlesLost++;
  }

  getStats(): LiveStats {
    if (this.trades.length === 0) return { totalTrades: 0, winRate: 0, captureRate: 0, avgSlippageLeakage: 0, bundlesWon: 0, bundlesLost: 0, pnlUsd: 0, emergencyStop: false };
    const wins = this.trades.filter(t => t.profitUsd > 0).length;
    const pnl = this.trades.reduce((s, t) => s + t.profitUsd, 0);
    const totalExpected = this.trades.reduce((s, t) => s + t.expectedNetBps / 10000 * t.capitalUsd, 0);
    const totalCaptured = this.trades.reduce((s, t) => s + t.profitUsd, 0);
    const avgLeakage = this.trades.reduce((s, t) => s + (t.realizedSlippageBps - t.expectedSlippageBps), 0) / this.trades.length;

    return {
      totalTrades: this.trades.length,
      winRate: Math.round(wins / this.trades.length * 100),
      captureRate: totalExpected > 0 ? Math.round(totalCaptured / totalExpected * 100) : 0,
      avgSlippageLeakage: Math.round(avgLeakage * 10) / 10,
      bundlesWon: this.bundlesWon,
      bundlesLost: this.bundlesLost,
      pnlUsd: Math.round(pnl * 10000) / 10000,
      emergencyStop: false,
    };
  }

  reset(): void { this.trades = []; this.bundlesWon = 0; this.bundlesLost = 0; }
}

export const livePnLTracker = new LivePnLTracker();
