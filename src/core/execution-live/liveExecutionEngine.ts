import { LiveTrade, ExecutionReceipt } from "./types";
import { jitoBundleBuilder } from "./jitoBundleBuilder";
import { jitoRelayManager } from "./jitoRelayManager";
import { multiRelaySender } from "./multiRelaySender";
import { liveRiskCircuitBreaker } from "./liveRiskCircuitBreaker";
import { realCapitalManager } from "./realCapitalManager";
import { logInfo, logSuccess, logWarning } from "../../logger";

export class LiveExecutionEngine {
  private trades: LiveTrade[] = [];
  private receipts: ExecutionReceipt[] = [];

  /** Execute a trade via Jito bundle with micro capital */
  async execute(
    pair: string,
    instructions: any[],
    computeUnits: number,
    computeUnitPrice: number,
    tipLamports: number,
  ): Promise<LiveTrade | null> {
    if (!liveRiskCircuitBreaker.canTrade()) {
      logWarning("[LIVE] Circuit breaker active — cannot trade");
      return null;
    }

    const capitalSol = realCapitalManager.requestTrade();
    if (capitalSol <= 0) {
      logWarning("[LIVE] No capital available");
      return null;
    }

    const bundle = jitoBundleBuilder.build(instructions, computeUnits, computeUnitPrice, tipLamports);
    const cost = jitoBundleBuilder.estimateCost(computeUnits, computeUnitPrice, tipLamports);

    logInfo(`[LIVE] Executing ${pair} with ${capitalSol.toFixed(4)} SOL (cost ~${cost.toFixed(6)} SOL)`);

    // Send via multi-relay
    const bundleId = `bundle_${Date.now()}`;
    const submissions = await multiRelaySender.sendToAllRelays(bundleId, bundle);

    // Mock: simulate landing
    const landed = submissions.some(s => !s.error);
    const profitSol = landed ? capitalSol * 0.01 : -capitalSol * 0.005; // mock PnL

    const trade: LiveTrade = {
      id: `trade_${Date.now()}`,
      pair,
      capitalSol,
      entrySlot: 0,
      exitSlot: 0,
      expectedProfitSol: capitalSol * 0.01,
      realizedProfitSol: profitSol,
      feesSol: cost,
      slippageBps: 2,
      bundleWon: landed,
      relay: submissions[0]?.relay || "",
      txHash: "",
      landed,
      timestamp: Date.now(),
    };

    this.trades.push(trade);

    // Record receipt
    const receipt: ExecutionReceipt = {
      tradeId: trade.id,
      txHash: trade.txHash,
      bundleUuid: bundleId,
      relay: trade.relay,
      slot: 0,
      latencyMs: 0,
      realizedProfitSol: profitSol,
      feesSol: cost,
      success: landed,
    };
    this.receipts.push(receipt);

    // Settle capital
    realCapitalManager.settleTrade(profitSol);

    // Check risk
    liveRiskCircuitBreaker.check(profitSol);

    if (profitSol > 0) {
      logSuccess(`[LIVE] ✅ ${pair} profit=+${(profitSol).toFixed(6)} SOL capital=${capitalSol.toFixed(4)} SOL`);
    } else {
      logWarning(`[LIVE] ❌ ${pair} profit=${profitSol.toFixed(6)} SOL`);
    }

    return trade;
  }

  getStats() {
    const wins = this.trades.filter(t => t.realizedProfitSol > 0).length;
    const totalPnl = this.trades.reduce((s, t) => s + t.realizedProfitSol, 0);
    return {
      totalTrades: this.trades.length,
      winRate: this.trades.length > 0 ? Math.round(wins / this.trades.length * 100) : 0,
      totalPnlSol: Math.round(totalPnl * 1000000) / 1000000,
      bundlesWon: this.trades.filter(t => t.bundleWon).length,
      emergencyStop: liveRiskCircuitBreaker.isStopped(),
      capital: realCapitalManager.getState(),
    };
  }

  printDashboard(): void {
    const s = this.getStats();
    const cap = realCapitalManager.getState();
    logSuccess(`━━━━━━━━ [LIVE EXECUTION] ──────────`);
    logInfo(`Mode: MICRO CAPITAL`);
    logInfo(`Capital: ${cap.maxTradeSol.toFixed(3)} SOL/trade (step ${cap.step + 1}/${5})`);
    logInfo(`Live trades: ${s.totalTrades} | Win rate: ${s.winRate}%`);
    logInfo(`Realized PnL: ${s.totalPnlSol >= 0 ? "+" : ""}${s.totalPnlSol.toFixed(6)} SOL`);
    logInfo(`Bundles won: ${s.bundlesWon}`);
    logInfo(`Emergency stop: ${s.emergencyStop ? "⚠️ ACTIVE" : "OFF"}`);
    logSuccess(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  reset(): void {
    this.trades = [];
    this.receipts = [];
    realCapitalManager.reset();
    liveRiskCircuitBreaker.reset();
  }
}

export const liveExecutionEngine = new LiveExecutionEngine();
