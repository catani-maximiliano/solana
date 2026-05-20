import { LiveTradeRecord, LiveExecutionGuardResult, CapitalAllocation, LiveStats } from "./types";
import { checkExecutionGuard } from "./liveExecutionGuard";
import { capitalAllocator } from "./capitalAllocator";
import { riskManager } from "./riskLimits";
import { livePnLTracker } from "./livePnLTracker";
import { realSlippageTracker } from "./realSlippageTracker";
import { logInfo, logSuccess, logWarning } from "../../logger";

export class LiveEngine {
  /** Check if a trade can be executed */
  canExecute(
    regime: string, toxicity: string, realityScore: number,
    landingProb: number, slippageBps: number, congestion: string,
  ): LiveExecutionGuardResult {
    if (riskManager.inEmergency()) return { allowed: false, reason: "Emergency stop active", riskScore: 100 };
    return checkExecutionGuard(regime, toxicity, realityScore, landingProb, slippageBps, congestion);
  }

  /** Execute a trade (record + track) */
  execute(
    pair: string, route: string, entrySlot: number, entryPrice: number,
    expectedNetBps: number, expectedSlippage: number, capitalUsd: number,
    landed: boolean, realizedSlippage: number, profitUsd: number, bundleWon: boolean,
    failureReason?: string,
  ): void {
    const trade: LiveTradeRecord = {
      id: `trade_${Date.now()}`,
      pair, route, entrySlot, entryPrice,
      exitSlot: 0, exitPrice: 0,
      expectedNetBps, realizedNetBps: 0,
      expectedSlippageBps: expectedSlippage,
      realizedSlippageBps: realizedSlippage,
      capitalUsd, profitUsd,
      landed, landedLate: false, partialFill: false,
      bundleWon, failureReason,
      timestamp: Date.now(),
    };

    livePnLTracker.recordTrade(trade);
    realSlippageTracker.record(expectedSlippage, realizedSlippage);
    capitalAllocator.recordTradeOutcome(profitUsd, profitUsd > 0);
    riskManager.check(profitUsd, realizedSlippage - expectedSlippage);

    if (profitUsd > 0) {
      logSuccess(`[LIVE] ✅ ${pair} profit=+$${(profitUsd).toFixed(4)} capital=$${capitalUsd.toFixed(2)}`);
    } else {
      logWarning(`[LIVE] ❌ ${pair} profit=$${profitUsd.toFixed(4)} ${failureReason || ""}`);
    }
  }

  getCapitalAllocation(): CapitalAllocation { return capitalAllocator.getState(); }
  getStats(): LiveStats { return livePnLTracker.getStats(); }

  /** Print live dashboard */
  printDashboard(): void {
    const stats = this.getStats();
    const capital = this.getCapitalAllocation();
    logSuccess(`━━━━━━━━ [LIVE ENGINE] ──────────`);
    logInfo(`Mode: MICRO_CAPITAL (max $${capital.maxTradeUsd.toFixed(2)})`);
    logInfo(`Real trades: ${stats.totalTrades} | Win rate: ${stats.winRate}%`);
    logInfo(`Capture rate: ${stats.captureRate}%`);
    logInfo(`Avg slippage leakage: ${stats.avgSlippageLeakage}bps`);
    logInfo(`Bundles won: ${stats.bundlesWon} | Lost: ${stats.bundlesLost}`);
    logInfo(`PnL real: ${stats.pnlUsd >= 0 ? "+" : ""}$${stats.pnlUsd.toFixed(4)}`);
    logInfo(`Emergency status: ${riskManager.inEmergency() ? "⚠️ STOP" : "✅ SAFE"}`);
    logSuccess(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  reset(): void {
    capitalAllocator.reset();
    riskManager.reset();
    livePnLTracker.reset();
    realSlippageTracker.reset();
  }
}

export const liveEngine = new LiveEngine();
