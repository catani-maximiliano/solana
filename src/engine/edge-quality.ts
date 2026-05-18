import { EdgeQualityScore, DepthProfile } from "./types";

const CADENCE_WINDOW = 60_000;

export class EdgeQualityScorer {
  private updateTimes = new Map<string, number[]>();
  private priceHistory = new Map<string, number[]>();
  private liquidityHistory = new Map<string, number[]>();

  recordUpdate(poolAddress: string, price: number, liquidity: number): void {
    const now = Date.now();
    const times = this.updateTimes.get(poolAddress) || [];
    times.push(now);
    this.updateTimes.set(poolAddress, times.slice(-50));

    const prices = this.priceHistory.get(poolAddress) || [];
    prices.push(price);
    this.priceHistory.set(poolAddress, prices.slice(-50));

    const liqs = this.liquidityHistory.get(poolAddress) || [];
    liqs.push(liquidity);
    this.liquidityHistory.set(poolAddress, liqs.slice(-50));

    this.prune(poolAddress);
  }

  getQuality(poolAddress: string, currentAge: number, currentLiquidity: number): EdgeQualityScore {
    const times = this.updateTimes.get(poolAddress) || [];
    const prices = this.priceHistory.get(poolAddress) || [];
    const liqs = this.liquidityHistory.get(poolAddress) || [];

    const liquidity = this.scoreLiquidity(currentLiquidity);
    const freshness = this.scoreFreshness(currentAge);
    const updateCadence = this.scoreCadence(times);
    const volatility = this.scoreVolatility(prices);
    const stability = this.scoreStability(liqs);
    const slippageProfile = this.scoreSlippageProfile(currentLiquidity);

    const overall = Math.min(1,
      liquidity * 0.25 + freshness * 0.20 + updateCadence * 0.15 + (1 - volatility) * 0.15 + stability * 0.10 + slippageProfile * 0.15
    );

    return { overall, liquidity, freshness, updateCadence, volatility, stability, slippageProfile };
  }

  private scoreLiquidity(liq: number): number {
    if (liq >= 50_000_000) return 1.0;
    if (liq >= 10_000_000) return 0.8;
    if (liq >= 5_000_000) return 0.6;
    if (liq >= 1_000_000) return 0.4;
    if (liq >= 100_000) return 0.2;
    return 0.1;
  }

  private scoreFreshness(ageMs: number): number {
    if (ageMs < 1000) return 1.0;
    if (ageMs < 3000) return 0.8;
    if (ageMs < 5000) return 0.6;
    if (ageMs < 10000) return 0.3;
    return 0.1;
  }

  private scoreCadence(times: number[]): number {
    if (times.length < 2) return 0.3;
    const recent = times.filter((t) => Date.now() - t < CADENCE_WINDOW);
    if (recent.length < 2) return 0.3;
    const intervals: number[] = [];
    for (let i = 1; i < recent.length; i++) {
      intervals.push(recent[i] - recent[i - 1]);
    }
    const avgInterval = intervals.reduce((s, v) => s + v, 0) / intervals.length;
    if (avgInterval <= 500) return 1.0;
    if (avgInterval <= 1000) return 0.8;
    if (avgInterval <= 3000) return 0.6;
    if (avgInterval <= 10000) return 0.3;
    return 0.1;
  }

  private scoreVolatility(prices: number[]): number {
    if (prices.length < 5) return 0.5;
    const recent = prices.slice(-10);
    const mean = recent.reduce((s, v) => s + v, 0) / recent.length;
    const variance = recent.reduce((s, v) => s + (v - mean) ** 2, 0) / recent.length;
    const stdDev = Math.sqrt(variance);
    const cv = mean > 0 ? stdDev / mean : 0;
    if (cv < 0.0001) return 0.1;
    if (cv < 0.001) return 0.3;
    if (cv < 0.005) return 0.6;
    if (cv < 0.01) return 0.8;
    return 1.0;
  }

  private scoreStability(liqs: number[]): number {
    if (liqs.length < 3) return 0.5;
    const recent = liqs.slice(-10);
    const mean = recent.reduce((s, v) => s + v, 0) / recent.length;
    if (mean <= 0) return 0.5;
    const maxDev = Math.max(...recent.map((v) => Math.abs(v - mean) / mean));
    if (maxDev < 0.01) return 1.0;
    if (maxDev < 0.05) return 0.8;
    if (maxDev < 0.10) return 0.6;
    if (maxDev < 0.25) return 0.4;
    return 0.2;
  }

  private scoreSlippageProfile(liq: number): number {
    if (liq >= 100_000_000) return 1.0;
    if (liq >= 50_000_000) return 0.8;
    if (liq >= 10_000_000) return 0.6;
    if (liq >= 1_000_000) return 0.4;
    return 0.2;
  }

  private prune(poolAddress: string): void {
    const cutoff = Date.now() - 300_000;
    const times = this.updateTimes.get(poolAddress);
    if (times) this.updateTimes.set(poolAddress, times.filter((t) => t > cutoff));
    const prices = this.priceHistory.get(poolAddress);
    if (prices && times) this.priceHistory.set(poolAddress, prices.slice(-50));
    const liqs = this.liquidityHistory.get(poolAddress);
    if (liqs && times) this.liquidityHistory.set(poolAddress, liqs.slice(-50));
  }

  reset(): void {
    this.updateTimes.clear();
    this.priceHistory.clear();
    this.liquidityHistory.clear();
  }
}

export const edgeQualityScorer = new EdgeQualityScorer();
