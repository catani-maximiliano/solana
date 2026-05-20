import { VolatilitySnapshot, VolatilityRegime } from "./types";

interface WindowData {
  spreads: number[];
  prices: number[];
  liquidity: number[];
}

export class VolatilityWindow {
  private windows = new Map<string, WindowData>();
  private readonly MAX_SAMPLES = 100;

  /** Record a spread observation */
  record(key: string, spreadBps: number, price: number, liquidity: number): void {
    let w = this.windows.get(key);
    if (!w) { w = { spreads: [], prices: [], liquidity: [] }; this.windows.set(key, w); }
    w.spreads.push(spreadBps);
    w.prices.push(price);
    w.liquidity.push(liquidity);
    if (w.spreads.length > this.MAX_SAMPLES) { w.spreads.shift(); w.prices.shift(); w.liquidity.shift(); }
  }

  /** Get volatility snapshot for a key */
  getSnapshot(key: string, windowMs = 5000): VolatilitySnapshot {
    const w = this.windows.get(key);
    if (!w || w.spreads.length < 3) {
      return { regime: "LOW", spreadVariance: 0, tickVariance: 0, liquidityDrift: 0, burstDetected: false, windowMs };
    }

    const now = Date.now();
    const spreads = w.spreads;
    const prices = w.prices;
    const liqs = w.liquidity;

    // Spread variance
    const mean = spreads.reduce((a, b) => a + b, 0) / spreads.length;
    const spreadVariance = spreads.reduce((sq, v) => sq + (v - mean) ** 2, 0) / spreads.length;

    // Price variance (tick noise)
    const priceMean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const tickVariance = prices.reduce((sq, v) => sq + (v - priceMean) ** 2, 0) / prices.length;

    // Liquidity drift: how much liq has changed recently
    const recentLiq = liqs.slice(-5);
    const liqMean = recentLiq.reduce((a, b) => a + b, 0) / recentLiq.length;
    const liqDrift = liqMean > 0 ? Math.abs(recentLiq[recentLiq.length - 1] - liqMean) / liqMean : 0;

    // Burst detection: sudden spike in variance
    const burstDetected = spreadVariance > 5 && spreads[spreads.length - 1] > mean * 1.5;

    // Determine regime
    let regime: VolatilityRegime = "LOW";
    if (spreadVariance > 20 || burstDetected) regime = "EXTREME";
    else if (spreadVariance > 10) regime = "HIGH";
    else if (spreadVariance > 3) regime = "MEDIUM";

    return { regime, spreadVariance: Math.round(spreadVariance * 100) / 100, tickVariance: Math.round(tickVariance * 100) / 100, liquidityDrift: Math.round(liqDrift * 100) / 100, burstDetected, windowMs };
  }

  reset(): void { this.windows.clear(); }
}

export const volatilityWindow = new VolatilityWindow();
