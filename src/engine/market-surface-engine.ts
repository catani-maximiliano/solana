import { priceGraph, MarketSurfaceEntry } from "../graph";
import { config } from "../config";
import { SurfaceReport, SurfacePoolEntry } from "./types";
import { slippageEstimator } from "./slippage-estimator";
import { edgeQualityScorer } from "./edge-quality";
import { logSuccess, logInfo, logDebug } from "../logger";

const SURFACE_CACHE_TTL = 5_000;
const SAFETY_MARGIN_BPS = 2;

function estimateSlippageBps(liquidity: number, tradeSizeUsd: number): number {
  if (liquidity <= 0 || tradeSizeUsd <= 0) return 5;
  const ratio = tradeSizeUsd / liquidity;
  if (ratio < 0.001) return 0.5;
  if (ratio < 0.005) return 1;
  if (ratio < 0.01) return 2;
  if (ratio < 0.05) return 5;
  if (ratio < 0.1) return 10;
  return 20;
}

function computeRequiredGrossBps(pools: MarketSurfaceEntry[], tradeSizeUsd: number): number {
  const valid = pools.filter((p) => p.health === "VALID" && p.price > 0);
  if (valid.length < 2) return 0;
  const avgFee = valid.reduce((s, p) => s + p.fee, 0) / valid.length;
  const avgLiq = valid.reduce((s, p) => s + p.liquidity, 0) / valid.length;
  const slipEstimate = estimateSlippageBps(avgLiq, tradeSizeUsd);
  const configMin = config.scanMinGrossSpreadBps || 0;
  const dynamic = Math.max(configMin, avgFee * 2 + slipEstimate + SAFETY_MARGIN_BPS);
  return Math.round(dynamic * 100) / 100;
}

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
  if (bestBid <= 0 || bestAsk <= 0 || bestBid <= bestAsk) return 0;
  const grossSpreadBps = ((bestBid - bestAsk) / bestAsk) * 10000;
  const valid = pools.filter((p) => p.health === "VALID" && p.price > 0);
  const avgFee = valid.reduce((s, p) => s + p.fee, 0) / Math.max(1, valid.length);
  return Math.max(0, grossSpreadBps - avgFee * 2);
}

function liquidityLabel(liq: number): string {
  if (liq >= 50_000_000) return "VERY_HIGH";
  if (liq >= 10_000_000) return "HIGH";
  if (liq >= 1_000_000) return "MEDIUM";
  if (liq >= 100_000) return "LOW";
  return "VERY_LOW";
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

    const bestAsk = validPools[0].price;
    const bestBid = validPools[validPools.length - 1].price;
    const midPrice = (bestAsk + bestBid) / 2;
    const spreadBps = bestAsk > 0 ? ((bestBid - bestAsk) / bestAsk) * 10000 : 0;
    const weightedMid = calcWeightedMid(validPools);
    const executableSpreadBps = computeExecutableSpreadBps(bestBid, bestAsk, validPools);
    const tradeSizeUsd = weightedMid * 0.05 * validPools.reduce((s, p) => s + p.liquidity, 0) / Math.max(1, validPools.length);
    const requiredGrossBps = computeRequiredGrossBps(validPools, tradeSizeUsd);
    const avgAge = validPools.reduce((s, p) => s + p.age, 0) / validPools.length;

    const poolsWithDepth: SurfacePoolEntry[] = validPools.map((p) => {
      const depthProfile = slippageEstimator.computeDepthProfile(p.poolAddress) || undefined;
      const qualityScore = edgeQualityScorer.getQuality(p.poolAddress, p.age, p.liquidity);
      return {
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
        depthProfile,
        qualityScore,
      };
    });

    const report: SurfaceReport = {
      pair,
      symbolA: surface.symbolA,
      symbolB: surface.symbolB,
      bestBid,
      bestAsk,
      bestAskVenue: validPools[0].dex,
      bestBidVenue: validPools[validPools.length - 1].dex,
      midPrice,
      spreadBps,
      executableSpreadBps,
      requiredGrossBps,
      weightedMid,
      pools: poolsWithDepth,
      freshness: Math.max(0, 1 - avgAge / 10_000),
      updatedAt: Date.now(),
    };

    this.cache.set(pair, { ...report, cachedAt: Date.now() });
    this.calculationCount++;
    return report;
  }

  invalidateCache(pair?: string): void {
    if (pair) this.cache.delete(pair);
    else this.cache.clear();
  }

  printSurfaceReport(pair: string): void {
    const report = this.getSurface(pair);
    if (!report) {
      logInfo(`Surface ${pair}: sin datos`);
      return;
    }

    const avgLiq = report.pools.reduce((s, p) => s + p.liquidity, 0) / report.pools.length;
    const minAge = Math.min(...report.pools.map((p) => p.age));

    logSuccess("══════════ SURFACE SPREAD ══════════");
    logInfo(`PAIR: ${pair}`);
    logInfo(`Pools: ${report.pools.length}`);
    logInfo("");
    logInfo(`BUY:  ${report.bestAskVenue} @ $${report.bestAsk.toFixed(6)}`);
    logInfo(`SELL: ${report.bestBidVenue} @ $${report.bestBid.toFixed(6)}`);
    logInfo("");
    logInfo(`Raw Spread:     +${report.spreadBps.toFixed(2)} bps`);
    logInfo(`Required Gross:  ${report.requiredGrossBps.toFixed(2)} bps (fees+slip+safety)`);
    logInfo(`Executable:      +${report.executableSpreadBps.toFixed(2)} bps`);
    logInfo("");
    logInfo(`Gross: +$${((report.bestBid - report.bestAsk) * 0.01).toFixed(4)}`);
    logInfo(`Fees: -${(report.pools.reduce((s, p) => s + p.fee, 0) / Math.max(1, report.pools.length)).toFixed(2)} bps`);
    logInfo(`Net: +${report.executableSpreadBps.toFixed(1)} bps`);
    if (report.spreadBps < report.requiredGrossBps) {
      logInfo(`SKIPPED_LOW_EDGE: gross ${report.spreadBps.toFixed(1)}bps < required ${report.requiredGrossBps.toFixed(1)}bps`);
    }
    logInfo(`Executable: ${report.executableSpreadBps > 0.5 ? "YES" : "NO"}`);
    logInfo("");
    logInfo(`midPrice: $${report.midPrice.toFixed(6)}`);
    logInfo(`weightedMid: $${report.weightedMid.toFixed(6)}`);
    logInfo(`liquidity: ${liquidityLabel(avgLiq)}`);
    logInfo(`freshness: ${minAge}ms`);
    logInfo("");
    for (const p of report.pools) {
      const depthNote = p.depthProfile ? `maxSize=${p.depthProfile.maxExecutableSize.toFixed(2)}SOL` : "";
      const qualityNote = p.qualityScore ? `qscore=${(p.qualityScore.overall * 100).toFixed(0)}%` : "";
      logInfo(`  ${p.dex} | $${p.price.toFixed(6)} | liq: ${(p.liquidity / 1_000_000).toFixed(1)}M | fee: ${p.fee}bps | ${depthNote} ${qualityNote}`);
    }
    logSuccess("════════════════════════════════════");
  }

  getStats() {
    return { cachedSurfaces: this.cache.size, calculations: this.calculationCount };
  }
}

export const surfaceEngine = new MarketSurfaceEngine();
