import { PriorityFeeInfo } from "./ExecutionTypes";

const BASE_FEE_MICRO_LAMPORTS = 100_000;
const MICRO_LAMPORTS_PER_SLOT = 10_000;

export class PriorityFeeManager {
  private recentFees: number[] = [];

  recordSlot(slot: number): void {
    // Mock: record recent slot for fee estimation
    this.recentFees.push(slot);
    if (this.recentFees.length > 100) this.recentFees.shift();
  }

  estimatePriorityFee(
    netBps: number,
    slotDelta: number,
    liquidityUsd: number,
  ): PriorityFeeInfo {
    // Base fee
    const baseFee = BASE_FEE_MICRO_LAMPORTS;

    // Volatility adjustment: higher when slot delta is large (more competition)
    const volatilityAdjustment = Math.min(500_000, slotDelta * MICRO_LAMPORTS_PER_SLOT);

    // Competition adjustment: higher for profitable spreads (more bots competing)
    const competitionAdjustment = netBps > 50 ? 200_000 : netBps > 20 ? 100_000 : 50_000;

    // Liquidity adjustment: lower for deeper pools (less slippage risk for others)
    const liquidityAdj = liquidityUsd > 10_000_000 ? 0 : 50_000;

    const microLamports = baseFee + volatilityAdjustment + competitionAdjustment - liquidityAdj;

    return {
      microLamports: Math.max(50_000, Math.min(2_000_000, microLamports)),
      baseFee,
      volatilityAdjustment,
      competitionAdjustment,
    };
  }

  getAverageFee(): number {
    if (this.recentFees.length === 0) return BASE_FEE_MICRO_LAMPORTS;
    return this.recentFees.reduce((a, b) => a + b, 0) / this.recentFees.length;
  }

  reset(): void {
    this.recentFees = [];
  }
}

export const priorityFeeManager = new PriorityFeeManager();
