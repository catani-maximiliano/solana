import { priceGraph, MarketSurfaceEntry } from "../graph";
import { SurfaceReport } from "./types";
import { slippageEstimator } from "./slippage-estimator";
import { logDebug, logSuccess, logInfo } from "../logger";

const SURFACE_CACHE_TTL = 5_000;

interface CachedSurface extends SurfaceReport {
  cachedAt: number;
}

function calcWeightedMid(pools: MarketSurfaceEntry[]): number {
  const valid = pools.filter((p) => p.health === "VALID" && p.price > 0);
  if (valid.length === 0) return 0;
  const totalLiq = valid.reduce((s, p) => s + p.liquidity, 0);
  if (totalLiq <= 0) return valid.reduce((s, p) => s + p.price, 0) / valid.length;
  return valid.reduce((s, p) => s + p.price * (p.liquidity / totalLiq), 0);
}

function computeExecutableSpreadBps(bestBid: number, bestAsk: number, pools: MarketSurfaceEntry[]): number {
  if (bestBid <= 0 || bestAsk <= 0 || bestBid >= bestAsk) return 0;
  const grossSpreadBps = ((bestAsk - bestBid) / bestBid) * 10000;
  const avgFee = pools
    .filter((p) => p.health === "VALID" && p.price > 0)
    .reduce((s, p) => s + p.fee, 0) / Math.max(1, pools.filter((p) => p.health === "VALID" && p.price > 0).length);
  const feeCostBps = avgFee * 2;
  const netSpreadBps = grossSpreadBps - feeCostBps;
  return Math.max(0, netSpreadBps);
}

export class MarketSurfaceEngine {
  private cache = new Map<string, CachedSurface>();
  private calculationCount = 0;

  getSurface(pair: string): SurfaceReport | null {
    const cached = this.cache.get(pair);
    if (cached && Date.now() - cached.cachedAt < SURFACE_CACHE_TTL) {
      return cached;
    }

    const surface = priceGraph.getMarketSurface(pair);
    if (!surface) return null;

    const validPools = surface.pools
      .filter((p) => p.health === "VALID" && p.price > 0)
      .sort((a, b) => a.price - b.price);

    if (validPools.length === 0) return null;

    const bestBid = validPools[0].price;
    const bestAsk = validPools[validPools.length - 1].price;
    const midPrice = (bestBid + bestAsk) / 2;
    const spreadBps = bestBid > 0 ? ((bestAsk - bestBid) / bestBid) * 10000 : 0;
    const weightedMid = calcWeightedMid(validPools);
    const executableSpreadBps = computeExecutableSpreadBps(bestBid, bestAsk, validPools);

    const avgAge = validPools.reduce((s, p) => s + p.age, 0) / validPools.length;

    const report: SurfaceReport = {
      pair,
      symbolA: surface.symbolA,
      symbolB: surface.symbolB,
      bestBid,
      bestAsk,
      bestBidVenue: validPools[0].dex,
      bestAskVenue: validPools[validPools.length - 1].dex,
      midPrice,
      spreadBps,
      executableSpreadBps,
      weightedMid,
      pools: validPools.map((p) => ({
        poolAddress: p.poolAddress,
        dex: p.dex,
        price: p.price,
        liquidity: p.liquidity,
        fee: p.fee,
        health: p.health,
        age: p.age,
        slot: p.slot,
        decimalsA: p.decimalsA,
        decimalsB: p.decimalsB,
      })),
      freshness: Math.max(0, 1 - avgAge / 10_000),
      updatedAt: Date.now(),
    };

    this.cache.set(pair, { ...report, cachedAt: Date.now() });
    this.calculationCount++;

    return report;
  }

  invalidateCache(pair?: string): void {
    if (pair) {
      this.cache.delete(pair);
    } else {
      this.cache.clear();
    }
  }

  printSurfaceReport(pair: string): void {
    const report = this.getSurface(pair);
    if (!report) {
      logInfo(`Surface ${pair}: sin datos`);
      return;
    }

    logSuccess(`========== SURFACE ENGINE: ${pair} ==========`);
    logInfo(`bestBid: $${report.bestBid.toFixed(6)} (${report.bestBidVenue})`);
    logInfo(`bestAsk: $${report.bestAsk.toFixed(6)} (${report.bestAskVenue})`);
    logInfo(`midPrice: $${report.midPrice.toFixed(6)}`);
    logInfo(`weightedMid: $${report.weightedMid.toFixed(6)}`);
    logInfo(`spread: ${report.spreadBps.toFixed(2)} bps`);
    logInfo(`executableSpread: ${report.executableSpreadBps.toFixed(2)} bps`);
    logInfo(`freshness: ${(report.freshness * 100).toFixed(0)}%`);
    logInfo(`pools: ${report.pools.length}`);

    for (const p of report.pools) {
      logInfo(`  ${p.dex} | $${p.price.toFixed(6)} | liq: ${(p.liquidity / 1_000_000).toFixed(1)}M | fee: ${p.fee}bps`);
    }
    logSuccess("============================================");
  }

  getStats() {
    return { cachedSurfaces: this.cache.size, calculations: this.calculationCount };
  }
}

export const surfaceEngine = new MarketSurfaceEngine();
