import { NormalizedRealtimeEvent } from "../../streams/registry/eventTypes";
import { FlowWindow, FlowState } from "./types";
import { logInfo, logDebug } from "../../logger";

class RollingWindow {
  private buckets: { time: number; buy: number; sell: number; trades: number; aggBuy: number; aggSell: number }[] = [];
  private windowMs: number;

  constructor(windowMs: number) { this.windowMs = windowMs; }

  record(isBuy: boolean, amount: number, aggressive: boolean): void {
    const now = Date.now();
    this.buckets.push({ time: now, buy: isBuy ? amount : 0, sell: isBuy ? 0 : amount, trades: 1, aggBuy: aggressive && isBuy ? 1 : 0, aggSell: aggressive && !isBuy ? 1 : 0 });
    this.prune(now);
  }

  getSnapshot(): FlowWindow {
    this.prune(Date.now());
    const buy = this.buckets.reduce((s, b) => s + b.buy, 0);
    const sell = this.buckets.reduce((s, b) => s + b.sell, 0);
    const total = buy + sell;
    return {
      buyVolume: buy,
      sellVolume: sell,
      tradeCount: this.buckets.reduce((s, b) => s + b.trades, 0),
      buyRatio: total > 0 ? buy / total : 0.5,
      netFlow: buy - sell,
      aggressiveBuy: this.buckets.reduce((s, b) => s + b.aggBuy, 0),
      aggressiveSell: this.buckets.reduce((s, b) => s + b.aggSell, 0),
    };
  }

  private prune(now: number): void {
    const cutoff = now - this.windowMs;
    this.buckets = this.buckets.filter(b => b.time >= cutoff);
  }
}

export class FlowEngine {
  private windows = new Map<string, RollingWindow>();
  private totalSwaps = 0;
  private buyVolume = 0;
  private sellVolume = 0;

  process(event: NormalizedRealtimeEvent): void {
    const key = `${event.pool}`;
    if (!this.windows.has(key)) this.windows.set(key, new RollingWindow(5000));
    const window = this.windows.get(key)!;

    const isBuy = event.amountIn < event.amountOut; // simplistic buy/sell heuristic
    const amount = Math.max(event.amountIn, event.amountOut);
    const aggressive = amount > 100_000; // large = aggressive

    window.record(isBuy, amount, aggressive);
    this.totalSwaps++;
    if (isBuy) this.buyVolume += amount;
    else this.sellVolume += amount;
  }

  getPoolFlow(pool: string): FlowWindow | null {
    const w = this.windows.get(pool);
    return w ? w.getSnapshot() : null;
  }

  getState(): FlowState {
    return {
      totalSwaps: this.totalSwaps,
      buyVolume: this.buyVolume,
      sellVolume: this.sellVolume,
      whaleAlerts: [],
      toxicPools: [],
      hotPools: [],
    };
  }

  reset(): void { this.windows.clear(); this.totalSwaps = 0; this.buyVolume = 0; this.sellVolume = 0; }
}

export const flowEngine = new FlowEngine();
