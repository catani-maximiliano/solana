import { marketState } from "../market/state-cache";
import { estimateSwapOutput } from "../math";
import { SwapSimulation, OptimalTradeResult, DepthProfile, TradeSizePoint } from "./types";

const TRADE_SIZES = [0.01, 0.03, 0.05, 0.1, 0.25, 0.5, 1.0];
const DEPTH_SIZES = [0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0];
const SOL_DECIMALS = 9;
const MAX_IMPACT_FOR_EXECUTABLE = 0.5;

function toLamports(amountSol: number): bigint {
  return BigInt(Math.floor(amountSol * 10 ** SOL_DECIMALS));
}

function fromLamports(lamports: bigint): number {
  return Number(lamports) / 10 ** SOL_DECIMALS;
}

function fromTokenUnits(amount: bigint, decimals: number): number {
  return Number(amount) / 10 ** decimals;
}

function wouldCrossTick(sqrtBefore: bigint, sqrtAfter: bigint, tickSpacing: number): boolean {
  const tickBefore = Math.log(Number(sqrtBefore) / 2 ** 64) / Math.log(Math.sqrt(1.0001));
  const tickAfter = Math.log(Number(sqrtAfter) / 2 ** 64) / Math.log(Math.sqrt(1.0001));
  const tickDiff = Math.abs(tickAfter - tickBefore);
  return tickDiff > tickSpacing * 0.5;
}

function getPoolData(poolAddress: string) {
  const pool = marketState.getPool(poolAddress);
  if (!pool) return null;
  const liquidity = BigInt(pool.liquidity);
  const sqrtPriceX64 = BigInt(pool.sqrtPriceX64);
  if (liquidity <= 0n || sqrtPriceX64 <= 0n) return null;
  return { pool, liquidity, sqrtPriceX64 };
}

export class SlippageEstimator {
  simulateBuy(poolAddress: string, tradeSizeSol: number): SwapSimulation {
    const d = getPoolData(poolAddress);
    if (!d) {
      return { expectedOut: 0, priceImpact: 1, effectivePrice: 0, feeCost: 0, totalCost: 0, executable: false, tickCrossing: false };
    }

    const { pool, liquidity, sqrtPriceX64 } = d;
    const inputDecimals = pool.decimalsB;
    const outputDecimals = pool.decimalsA;
    const sqrtPriceNum = Number(sqrtPriceX64) / 2 ** 64;
    const spotPrice = sqrtPriceNum * sqrtPriceNum * Math.pow(10, pool.decimalsA - pool.decimalsB);

    const usdcIn = BigInt(Math.floor(tradeSizeSol * spotPrice * 10 ** inputDecimals));
    if (usdcIn <= 0n) {
      return { expectedOut: 0, priceImpact: 1, effectivePrice: 0, feeCost: 0, totalCost: 0, executable: false, tickCrossing: false };
    }

    const result = estimateSwapOutput(liquidity, sqrtPriceX64, usdcIn, pool.fee, false);

    const solOut = fromTokenUnits(result.outputAmount, outputDecimals);
    const totalCostUsdc = fromTokenUnits(usdcIn, inputDecimals);
    const effectivePrice = solOut > 0 ? totalCostUsdc / solOut : 0;
    const priceImpact = spotPrice > 0 && totalCostUsdc > 0
      ? Math.abs(1 - totalCostUsdc / (solOut * spotPrice)) * 100
      : 1;
    const feeCost = fromTokenUnits(result.feePaid, inputDecimals);
    const tickCrossing = wouldCrossTick(sqrtPriceX64, result.sqrtPriceAfter, pool.tick > 0 ? pool.tick : 64);

    return {
      expectedOut: solOut,
      priceImpact: Math.min(100, priceImpact),
      effectivePrice,
      feeCost,
      totalCost: totalCostUsdc,
      executable: solOut > 0 && priceImpact < 50,
      tickCrossing,
    };
  }

  simulateSell(poolAddress: string, solAmount: number): SwapSimulation {
    const d = getPoolData(poolAddress);
    if (!d) {
      return { expectedOut: 0, priceImpact: 1, effectivePrice: 0, feeCost: 0, totalCost: 0, executable: false, tickCrossing: false };
    }

    const { pool, liquidity, sqrtPriceX64 } = d;
    const solIn = toLamports(solAmount);
    if (solIn <= 0n) {
      return { expectedOut: 0, priceImpact: 1, effectivePrice: 0, feeCost: 0, totalCost: 0, executable: false, tickCrossing: false };
    }

    const result = estimateSwapOutput(liquidity, sqrtPriceX64, solIn, pool.fee, true);

    const expectedOutUsdc = fromTokenUnits(result.outputAmount, pool.decimalsB);
    const sqrtBefore = Number(sqrtPriceX64) / 2 ** 64;
    const priceBefore = sqrtBefore * sqrtBefore * Math.pow(10, pool.decimalsA - pool.decimalsB);
    const sqrtAfter = Number(result.sqrtPriceAfter) / 2 ** 64;
    const priceAfter = sqrtAfter * sqrtAfter * Math.pow(10, pool.decimalsA - pool.decimalsB);
    const priceImpact = priceBefore > 0
      ? Math.abs(priceAfter - priceBefore) / priceBefore * 100
      : 1;
    const feeCost = fromLamports(result.feePaid);
    const effectivePrice = expectedOutUsdc > 0 ? expectedOutUsdc / solAmount : 0;
    const tickCrossing = wouldCrossTick(sqrtPriceX64, result.sqrtPriceAfter, pool.tick > 0 ? pool.tick : 64);

    return {
      expectedOut: expectedOutUsdc,
      priceImpact: Math.min(100, priceImpact),
      effectivePrice,
      feeCost,
      totalCost: solAmount,
      executable: expectedOutUsdc > 0 && priceImpact < 50,
      tickCrossing,
    };
  }

  simulateArb(buyPool: string, sellPool: string, tradeSizeSol: number): OptimalTradeResult {
    const buySim = this.simulateBuy(buyPool, tradeSizeSol);
    if (!buySim.executable || buySim.tickCrossing || buySim.expectedOut <= 0) {
      return {
        size: tradeSizeSol, netProfit: 0,
        buySim,
        sellSim: { expectedOut: 0, priceImpact: 1, effectivePrice: 0, feeCost: 0, totalCost: 0, executable: false, tickCrossing: false },
      };
    }

    const solOut = buySim.expectedOut;
    const sellSim = this.simulateSell(sellPool, solOut);

    if (!sellSim.executable || sellSim.tickCrossing) {
      return {
        size: tradeSizeSol, netProfit: 0,
        buySim, sellSim,
      };
    }

    const netProfit = sellSim.expectedOut - buySim.totalCost;

    return { size: tradeSizeSol, netProfit, buySim, sellSim };
  }

  findOptimalTrade(buyPool: string, sellPool: string): OptimalTradeResult {
    let best: OptimalTradeResult = {
      size: 0, netProfit: -Infinity,
      buySim: { expectedOut: 0, priceImpact: 1, effectivePrice: 0, feeCost: 0, totalCost: 0, executable: false, tickCrossing: false },
      sellSim: { expectedOut: 0, priceImpact: 1, effectivePrice: 0, feeCost: 0, totalCost: 0, executable: false, tickCrossing: false },
    };

    for (const size of TRADE_SIZES) {
      const result = this.simulateArb(buyPool, sellPool, size);
      if (result.netProfit > best.netProfit) {
        best = result;
      }
    }

    return best;
  }

  computeDepthProfile(poolAddress: string): DepthProfile | null {
    const pool = marketState.getPool(poolAddress);
    if (!pool) return null;

    const points: TradeSizePoint[] = [];
    let maxExecutableSize = 0;
    let impactAtMax = 0;

    for (const size of DEPTH_SIZES) {
      const sim = this.simulateSell(poolAddress, size);
      points.push({
        sizeSol: size,
        priceImpact: sim.priceImpact,
        effectivePrice: sim.effectivePrice,
        feeCost: sim.feeCost,
      });
      if (sim.priceImpact < MAX_IMPACT_FOR_EXECUTABLE) {
        maxExecutableSize = size;
        impactAtMax = sim.priceImpact;
      }
    }

    const liq = Number(pool.liquidity) || 0;
    const depthScore = Math.min(1, Math.log10(Math.max(1, liq)) / 9);

    return {
      poolAddress,
      dex: pool.dex,
      price: 0,
      liquidity: liq,
      fee: pool.fee,
      sizes: points,
      maxExecutableSize,
      impactAtMax,
      depthScore,
    };
  }

  getMaxExecutableSize(poolAddress: string): number {
    const profile = this.computeDepthProfile(poolAddress);
    return profile?.maxExecutableSize ?? 0;
  }
}

export const slippageEstimator = new SlippageEstimator();
