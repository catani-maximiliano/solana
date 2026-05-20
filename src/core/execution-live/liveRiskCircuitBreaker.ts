import { logWarning, logError } from "../../logger";

export class LiveRiskCircuitBreaker {
  private consecutiveLosses = 0;
  private dailyLossSol = 0;
  private dailyResetTime = Date.now();
  private totalLosses = 0;
  private emergencyStop = false;

  readonly MAX_CONSECUTIVE_LOSSES = 3;
  readonly MAX_DAILY_LOSS_SOL = 0.05;
  readonly MAX_TOTAL_LOSSES = 10;

  check(profitSol: number): boolean {
    // Reset daily counter
    if (Date.now() - this.dailyResetTime > 86_400_000) {
      this.dailyLossSol = 0;
      this.dailyResetTime = Date.now();
    }

    if (profitSol < 0) {
      this.consecutiveLosses++;
      this.dailyLossSol += Math.abs(profitSol);
      this.totalLosses++;
    } else {
      this.consecutiveLosses = 0;
    }

    if (this.consecutiveLosses >= this.MAX_CONSECUTIVE_LOSSES) {
      this.emergencyStop = true;
      logError(`[CIRCUIT] EMERGENCY STOP: ${this.consecutiveLosses} consecutive losses`);
      return false;
    }

    if (this.dailyLossSol >= this.MAX_DAILY_LOSS_SOL) {
      this.emergencyStop = true;
      logError(`[CIRCUIT] EMERGENCY STOP: daily loss ${this.dailyLossSol.toFixed(4)} SOL exceeds ${this.MAX_DAILY_LOSS_SOL} SOL`);
      return false;
    }

    if (this.totalLosses >= this.MAX_TOTAL_LOSSES) {
      this.emergencyStop = true;
      logError(`[CIRCUIT] EMERGENCY STOP: ${this.totalLosses} total losses`);
      return false;
    }

    return true;
  }

  isStopped(): boolean { return this.emergencyStop; }
  canTrade(): boolean { return !this.emergencyStop; }

  reset(): void {
    this.consecutiveLosses = 0;
    this.dailyLossSol = 0;
    this.totalLosses = 0;
    this.emergencyStop = false;
  }
}

export const liveRiskCircuitBreaker = new LiveRiskCircuitBreaker();
