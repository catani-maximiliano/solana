import { MicrostructureMetrics } from "./types";

const HISTORY_SIZE = 50;
const WINDOW_MS = 60_000;

function calcMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function calcVariance(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  return values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
}

export class MicrostructureAnalyzer {
  private poolPrices = new Map<string, { price: number; time: number }[]>();
  private poolLiqs = new Map<string, number[]>();
  private pairSpreads = new Map<string, number[]>();

  recordPoolPrice(poolAddress: string, price: number): void {
    const history = this.poolPrices.get(poolAddress) || [];
    history.push({ price, time: Date.now() });
    this.poolPrices.set(poolAddress, history.slice(-HISTORY_SIZE));
  }

  recordPoolLiquidity(poolAddress: string, liquidity: number): void {
    const history = this.poolLiqs.get(poolAddress) || [];
    history.push(liquidity);
    this.poolLiqs.set(poolAddress, history.slice(-HISTORY_SIZE));
  }

  recordPairSpread(pair: string, spreadBps: number): void {
    const history = this.pairSpreads.get(pair) || [];
    history.push(spreadBps);
    this.pairSpreads.set(pair, history.slice(-HISTORY_SIZE));
  }

  getPoolMetrics(poolAddress: string): Partial<MicrostructureMetrics> {
    const prices = this.poolPrices.get(poolAddress) || [];
    const liqs = this.poolLiqs.get(poolAddress) || [];

    const volatility = this.calcVolatility(prices);
    const updateCadence = this.calcCadence(prices);
    const liquidityStability = this.calcLiquidityStability(liqs);
    const edgeFreshness = prices.length > 0 ? Math.min(1, 1 - (Date.now() - prices[prices.length - 1].time) / 10_000) : 0;

    return { edgeFreshness, updateCadence, volatility, liquidityStability };
  }

  getPairMetrics(pair: string): Partial<MicrostructureMetrics> {
    const spreads = this.pairSpreads.get(pair) || [];
    const spreadVariance = spreads.length >= 2 ? calcVariance(spreads, calcMean(spreads)) : 0;
    const marketPressure = this.calcMarketPressure(spreads);

    return { spreadVariance, marketPressure };
  }

  getFullMetrics(poolAddress: string, pair: string): MicrostructureMetrics {
    const pool = this.getPoolMetrics(poolAddress);
    const pair_m = this.getPairMetrics(pair);
    return {
      edgeFreshness: pool.edgeFreshness ?? 0,
      updateCadence: pool.updateCadence ?? 0,
      volatility: pool.volatility ?? 0,
      liquidityStability: pool.liquidityStability ?? 0,
      spreadVariance: pair_m.spreadVariance ?? 0,
      marketPressure: pair_m.marketPressure ?? 0,
    };
  }

  private calcVolatility(prices: { price: number; time: number }[]): number {
    if (prices.length < 5) return 0.5;
    const vals = prices.slice(-20).map((p) => p.price);
    const mean = calcMean(vals);
    if (mean <= 0) return 0.5;
    const variance = calcVariance(vals, mean);
    const cv = Math.sqrt(variance) / mean;
    return Math.min(1, cv * 100);
  }

  private calcCadence(prices: { price: number; time: number }[]): number {
    if (prices.length < 2) return 0;
    const recent = prices.filter((p) => Date.now() - p.time < WINDOW_MS);
    if (recent.length < 2) return recent.length > 0 ? 0.3 : 0;
    return Math.min(1, recent.length / 60);
  }

  private calcLiquidityStability(liqs: number[]): number {
    if (liqs.length < 3) return 0.5;
    const recent = liqs.slice(-10);
    const mean = calcMean(recent);
    if (mean <= 0) return 0.5;
    const maxDev = Math.max(...recent.map((v) => Math.abs(v - mean) / mean));
    return Math.max(0, Math.min(1, 1 - maxDev));
  }

  private calcMarketPressure(spreads: number[]): number {
    if (spreads.length < 3) return 0;
    const recent = spreads.slice(-10);
    const trend = recent[recent.length - 1] - recent[0];
    return Math.max(-1, Math.min(1, trend / 10));
  }

  reset(): void {
    this.poolPrices.clear();
    this.poolLiqs.clear();
    this.pairSpreads.clear();
  }
}

export const microstructure = new MicrostructureAnalyzer();
