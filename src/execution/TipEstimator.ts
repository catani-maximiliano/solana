import { TipInfo } from "./ExecutionTypes";

const BASE_TIP_LAMPORTS = 1_000;
const JITO_TIP_FLOOR = 1_000;

export class TipEstimator {
  estimateTip(
    netBps: number,
    profitUsd: number,
    confidence: number,
    liquidityUsd: number,
  ): TipInfo {
    // Base tip: Jito bundle minimum
    const baseTip = JITO_TIP_FLOOR;

    // Spread bonus: higher spread → tip up to 50% of profit
    const maxTipByProfit = Math.max(0, profitUsd * 0.5 * 1_000_000_000); // in lamports
    const spreadBonus = Math.min(maxTipByProfit, netBps > 30 ? 5_000 : netBps > 15 ? 2_000 : 1_000);

    // Confidence multiplier: higher confidence → more willing to tip
    const confidenceMultiplier = Math.max(0.5, Math.min(1.5, confidence));

    // Liquidity adjustment: deep pools need lower tips (lessMEV competition)
    const liqFactor = liquidityUsd > 10_000_000 ? 0.8 : 1.0;

    const lamports = Math.round((baseTip + spreadBonus) * confidenceMultiplier * liqFactor);

    return {
      lamports: Math.max(1_000, lamports),
      baseTip,
      spreadBonus,
      confidenceMultiplier: confidenceMultiplier * liqFactor,
    };
  }

  reset(): void {}
}

export const tipEstimator = new TipEstimator();
