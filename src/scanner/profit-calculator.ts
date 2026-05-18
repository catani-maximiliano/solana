import { Connection } from "@solana/web3.js";

export interface FeeBreakdown {
  swapFeesLamports: number;
  swapFeesUsd: number;
  priorityFeeLamports: number;
  priorityFeeUsd: number;
  slippageCostLamports: number;
  slippageCostUsd: number;
  mevCostLamports: number;
  mevCostUsd: number;
  networkFeeLamports: number;
  networkFeeUsd: number;
  totalLamports: number;
  totalUsd: number;
}

export interface ProfitEstimate {
  grossProfitLamports: number;
  grossProfitUsd: number;
  fees: FeeBreakdown;
  netProfitLamports: number;
  netProfitUsd: number;
  netProfitPct: number;
  isProfitable: boolean;
  minProfitThreshold: number;
}

const SOL_PRICE_USD = 160;
const LAMPORTS_PER_SOL = 1_000_000_000;
const BASE_NETWORK_FEE_LAMPORTS = 5000;
const JITO_TIP_ESTIMATE_LAMPORTS = 100_000;

export class ProfitCalculator {
  private connection: Connection;
  private priorityFeeCache: { fee: number; timestamp: number } = { fee: 0, timestamp: 0 };
  private readonly PRIORITY_CACHE_TTL = 30_000;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  private lamportsToUsd(lamports: number): number {
    return (lamports / LAMPORTS_PER_SOL) * SOL_PRICE_USD;
  }

  async estimatePriorityFee(): Promise<number> {
    if (Date.now() - this.priorityFeeCache.timestamp < this.PRIORITY_CACHE_TTL) {
      return this.priorityFeeCache.fee;
    }
    try {
      const recentFees = await this.connection.getRecentPrioritizationFees();
      if (recentFees.length > 0) {
        const avg = recentFees.reduce((s, f) => s + f.prioritizationFee, 0) / recentFees.length;
        this.priorityFeeCache = { fee: Math.ceil(avg * 1.5), timestamp: Date.now() };
        return this.priorityFeeCache.fee;
      }
    } catch {
      // fallback
    }
    return 10_000;
  }

  async estimate(
    grossProfitLamports: number,
    routePlan: Array<{ feeAmount?: number }>,
    slippageBps: number,
    amountInLamports: number,
    multiplier: number = 2
  ): Promise<ProfitEstimate> {
    const swapFeesLamports = routePlan.reduce((sum, s) => sum + (s.feeAmount || 0), 0);
    const priorityFeeLamports = await this.estimatePriorityFee();
    const slippageCostLamports = Math.floor(amountInLamports * slippageBps / 10_000);
    const mevCostLamports = JITO_TIP_ESTIMATE_LAMPORTS;
    const networkFeeLamports = BASE_NETWORK_FEE_LAMPORTS;

    const totalFeesLamports = swapFeesLamports + priorityFeeLamports + slippageCostLamports + mevCostLamports + networkFeeLamports;

    const netProfitLamports = grossProfitLamports - totalFeesLamports;
    const netProfitUsd = this.lamportsToUsd(netProfitLamports);
    const grossProfitUsd = this.lamportsToUsd(grossProfitLamports);
    const netProfitPct = amountInLamports > 0 ? (netProfitLamports / amountInLamports) * 100 : 0;
    const minProfitThreshold = this.lamportsToUsd(totalFeesLamports * multiplier);

    const fees: FeeBreakdown = {
      swapFeesLamports,
      swapFeesUsd: this.lamportsToUsd(swapFeesLamports),
      priorityFeeLamports,
      priorityFeeUsd: this.lamportsToUsd(priorityFeeLamports),
      slippageCostLamports,
      slippageCostUsd: this.lamportsToUsd(slippageCostLamports),
      mevCostLamports,
      mevCostUsd: this.lamportsToUsd(mevCostLamports),
      networkFeeLamports,
      networkFeeUsd: this.lamportsToUsd(networkFeeLamports),
      totalLamports: totalFeesLamports,
      totalUsd: this.lamportsToUsd(totalFeesLamports),
    };

    return {
      grossProfitLamports,
      grossProfitUsd,
      fees,
      netProfitLamports,
      netProfitUsd,
      netProfitPct,
      isProfitable: netProfitUsd > minProfitThreshold,
      minProfitThreshold,
    };
  }
}
