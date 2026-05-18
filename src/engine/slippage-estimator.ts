import { marketState } from "../market/state-cache";
import { estimateSwapOutput } from "../math";
import { SwapSimulation, OptimalTradeResult } from "./types";
import { logDebug } from "../logger";

const TRADE_SIZES = [0.01, 0.025, 0.05, 0.1, 0.25];
const SOL_DECIMALS = 9;
const USDC_DECIMALS = 6;

function toLamports(amountSol: number): bigint {
  return BigInt(Math.floor(amountSol * 10 ** SOL_DECIMALS));
}

function fromLamports(lamports: bigint): number {
  return Number(lamports) / 10 ** SOL_DECIMALS;
}

function fromTokenUnits(amount: bigint, decimals: number): number {
  return Number(amount) / 10 ** decimals;
}

export class SlippageEstimator {
  simulateBuy(
    poolAddress: string,
    tradeSizeSol: number,
  ): SwapSimulation {
    const pool = marketState.getPool(poolAddress);
    if (!pool) {
      return { expectedOut: 0, priceImpact: 1, effectivePrice: 0, feeCost: 0, totalCost: 0, executable: false };
    }

    const liquidity = BigInt(pool.liquidity);
    if (liquidity <= 0n) {
      return { expectedOut: 0, priceImpact: 1, effectivePrice: 0, feeCost: 0, totalCost: 0, executable: false };
    }

    const sqrtPriceX64 = BigInt(pool.sqrtPriceX64);
    if (sqrtPriceX64 <= 0n) {
      return { expectedOut: 0, priceImpact: 1, effectivePrice: 0, feeCost: 0, totalCost: 0, executable: false };
    }

    const inputDecimals = pool.decimalsB;
    const outputDecimals = pool.decimalsA;
    const price = Number(sqrtPriceX64) / 2 ** 64;
    const spotPrice = price * price * Math.pow(10, pool.decimalsA - pool.decimalsB);
    const inputAmount = BigInt(Math.floor(tradeSizeSol * spotPrice * 10 ** inputDecimals));

    const result = estimateSwapOutput(
      liquidity, sqrtPriceX64, inputAmount, pool.fee, false,
    );

    const expectedOut = fromTokenUnits(result.outputAmount, outputDecimals);
    const effectivePrice = result.outputAmount > 0n
      ? Number(inputAmount) / Number(result.outputAmount) * Math.pow(10, outputDecimals - inputDecimals)
      : 0;
    const priceImpact = expectedOut > 0
      ? Math.abs((tradeSizeSol - expectedOut * spotPrice) / (tradeSizeSol)) * 100
      : 0;
    const feeCost = fromTokenUnits(result.feePaid, inputDecimals);

    return {
      expectedOut,
      priceImpact: Math.min(100, priceImpact),
      effectivePrice,
      feeCost,
      totalCost: feeCost,
      executable: expectedOut > 0,
    };
  }

  simulateSell(
    poolAddress: string,
    tradeSizeSol: number,
  ): SwapSimulation {
    const pool = marketState.getPool(poolAddress);
    if (!pool) {
      return { expectedOut: 0, priceImpact: 1, effectivePrice: 0, feeCost: 0, totalCost: 0, executable: false };
    }

    const liquidity = BigInt(pool.liquidity);
    if (liquidity <= 0n) {
      return { expectedOut: 0, priceImpact: 1, effectivePrice: 0, feeCost: 0, totalCost: 0, executable: false };
    }

    const sqrtPriceX64 = BigInt(pool.sqrtPriceX64);
    if (sqrtPriceX64 <= 0n) {
      return { expectedOut: 0, priceImpact: 1, effectivePrice: 0, feeCost: 0, totalCost: 0, executable: false };
    }

    const inputAmount = toLamports(tradeSizeSol);

    const result = estimateSwapOutput(
      liquidity, sqrtPriceX64, inputAmount, pool.fee, true,
    );

    const expectedOutUsdc = fromTokenUnits(result.outputAmount, pool.decimalsB);
    const effectivePrice = expectedOutUsdc / tradeSizeSol;
    const priceBefore = Number(sqrtPriceX64) / 2 ** 64;
    const priceBeforeAdj = priceBefore * priceBefore * Math.pow(10, pool.decimalsA - pool.decimalsB);
    const sqrtAfter = Number(result.sqrtPriceAfter) / 2 ** 64;
    const priceAfterAdj = sqrtAfter * sqrtAfter * Math.pow(10, pool.decimalsA - pool.decimalsB);
    const priceImpact = priceBeforeAdj > 0
      ? Math.abs(priceAfterAdj - priceBeforeAdj) / priceBeforeAdj * 100
      : 0;
    const feeCost = fromLamports(result.feePaid);

    return {
      expectedOut: expectedOutUsdc,
      priceImpact: Math.min(100, priceImpact),
      effectivePrice,
      feeCost,
      totalCost: feeCost,
      executable: expectedOutUsdc > 0,
    };
  }

  findOptimalTrade(
    buyPool: string,
    sellPool: string,
  ): OptimalTradeResult {
    let best: OptimalTradeResult = {
      size: 0, netProfit: -Infinity,
      buySim: { expectedOut: 0, priceImpact: 1, effectivePrice: 0, feeCost: 0, totalCost: 0, executable: false },
      sellSim: { expectedOut: 0, priceImpact: 1, effectivePrice: 0, feeCost: 0, totalCost: 0, executable: false },
    };

    for (const size of TRADE_SIZES) {
      const buySim = this.simulateBuy(buyPool, size);
      const sellSim = this.simulateSell(sellPool, size);

      if (!buySim.executable || !sellSim.executable) continue;

      const netProfit = sellSim.expectedOut - buySim.totalCost;
      if (netProfit > best.netProfit) {
        best = { size, netProfit, buySim, sellSim };
      }
    }

    return best;
  }
}

export const slippageEstimator = new SlippageEstimator();
