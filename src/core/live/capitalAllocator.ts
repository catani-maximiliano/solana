import { CapitalAllocation } from "./types";

const INITIAL_MAX_TRADE_SOL = 0.01;
const INITIAL_MAX_EXPOSURE_SOL = 0.05;
const SOL_PRICE_USD = 84;

export class CapitalAllocator {
  private allocation: CapitalAllocation = {
    maxTradeUsd: INITIAL_MAX_TRADE_SOL * SOL_PRICE_USD,
    maxExposureUsd: INITIAL_MAX_EXPOSURE_SOL * SOL_PRICE_USD,
    maxConcurrentTrades: 1,
    currentExposureUsd: 0,
  };

  private consecutiveWins = 0;
  private tradeCount = 0;

  /** Request allocation for a trade */
  requestAllocation(expectedBps: number, confidence: number): number {
    if (this.allocation.currentExposureUsd >= this.allocation.maxExposureUsd) return 0;

    // Base: fixed micro amount
    let tradeSize = this.allocation.maxTradeUsd;

    // Scale slightly with confidence
    if (confidence > 0.7 && this.consecutiveWins > 5) tradeSize *= 1.5;
    if (confidence < 0.4) tradeSize *= 0.5;

    return Math.min(tradeSize, this.allocation.maxExposureUsd - this.allocation.currentExposureUsd);
  }

  recordTradeOutcome(profitUsd: number, won: boolean): void {
    this.tradeCount++;
    if (won) this.consecutiveWins++;
    else this.consecutiveWins = 0;
  }

  getState(): CapitalAllocation { return { ...this.allocation }; }

  reset(): void {
    this.allocation = {
      maxTradeUsd: INITIAL_MAX_TRADE_SOL * SOL_PRICE_USD,
      maxExposureUsd: INITIAL_MAX_EXPOSURE_SOL * SOL_PRICE_USD,
      maxConcurrentTrades: 1,
      currentExposureUsd: 0,
    };
    this.consecutiveWins = 0;
    this.tradeCount = 0;
  }
}

export const capitalAllocator = new CapitalAllocator();
