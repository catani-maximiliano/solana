import { RiskLimits } from "./types";
import { logWarning } from "../../logger";

export class RiskManager {
  private limits: RiskLimits = {
    maxDailyLossUsd: 0.50,
    maxConsecutiveLosses: 3,
    maxLeakageBps: 10,
    emergencyStop: false,
  };

  private dailyPnL = 0;
  private consecutiveLosses = 0;
  private totalTrades = 0;

  check(profitUsd: number, slippageLeakage: number): boolean {
    this.dailyPnL += profitUsd;
    this.totalTrades++;

    if (profitUsd < 0) this.consecutiveLosses++;
    else this.consecutiveLosses = 0;

    if (this.dailyPnL < -this.limits.maxDailyLossUsd) {
      this.limits.emergencyStop = true;
      logWarning(`[RISK] Emergency stop: daily loss ${this.dailyPnL.toFixed(4)}USD exceeds limit ${this.limits.maxDailyLossUsd}USD`);
      return false;
    }

    if (this.consecutiveLosses >= this.limits.maxConsecutiveLosses) {
      this.limits.emergencyStop = true;
      logWarning(`[RISK] Emergency stop: ${this.consecutiveLosses} consecutive losses`);
      return false;
    }

    if (slippageLeakage > this.limits.maxLeakageBps) {
      logWarning(`[RISK] Slippage leakage ${slippageLeakage}bps exceeds limit ${this.limits.maxLeakageBps}bps — reducing size`);
      return false;
    }

    return true;
  }

  getLimits(): RiskLimits { return { ...this.limits }; }
  inEmergency(): boolean { return this.limits.emergencyStop; }

  reset(): void {
    this.limits.emergencyStop = false;
    this.dailyPnL = 0;
    this.consecutiveLosses = 0;
    this.totalTrades = 0;
  }
}

export const riskManager = new RiskManager();
