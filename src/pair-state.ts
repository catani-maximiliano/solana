import { marketState, PoolStateSnapshot } from "./market/state-cache";
import { priceGraph } from "./graph";
import { sqrtPriceX64ToPrice } from "./math";
import { eventBus } from "./events";
import { logDebug } from "./logger";

export interface MonitoredPair {
  label: string;
  mintA: string;
  mintB: string;
  poolAddresses: string[];
  enabled: boolean;
  latestSpread: number;
  latestProfitUsd: number;
  confidence: number;
  persistence: number;
  volatility: number;
  lastUpdate: number;
  skipCount: number;
  priority: number;
}

const MONITORED_PAIRS: Array<{ label: string; mintA: string; mintB: string }> = [
  { label: "SOL/USDC", mintA: "So11111111111111111111111111111111111111112", mintB: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
  { label: "SOL/USDT", mintA: "So11111111111111111111111111111111111111112", mintB: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB" },
  { label: "SOL/JUP", mintA: "So11111111111111111111111111111111111111112", mintB: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN" },
  { label: "SOL/RAY", mintA: "So11111111111111111111111111111111111111112", mintB: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R" },
  { label: "SOL/BONK", mintA: "So11111111111111111111111111111111111111112", mintB: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
  { label: "WIF/USDC", mintA: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", mintB: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
];

export class PairStateManager {
  private pairs: Map<string, MonitoredPair> = new Map();
  private spreadHistory = new Map<string, { spread: number; dex: string; timestamp: number }[]>();
  private readonly SPREAD_HISTORY_LIMIT = 50;
  private readonly MAX_SKIP = 20;

  constructor() {
    for (const p of MONITORED_PAIRS) {
      this.pairs.set(p.label, {
        ...p,
        poolAddresses: [],
        enabled: true,
        latestSpread: 0,
        latestProfitUsd: 0,
        confidence: 0,
        persistence: 0,
        volatility: 0,
        lastUpdate: 0,
        skipCount: 0,
        priority: 1.0,
      });
    }
  }

  registerPool(pairLabel: string, poolAddress: string): void {
    const pair = this.pairs.get(pairLabel);
    if (!pair) return;
    if (!pair.poolAddresses.includes(poolAddress)) {
      pair.poolAddresses.push(poolAddress);
    }
  }

  recordSpread(label: string, spreadPct: number, dex: string): void {
    const pair = this.pairs.get(label);
    if (!pair) return;

    pair.latestSpread = spreadPct;
    pair.lastUpdate = Date.now();
    pair.skipCount = 0;

    if (spreadPct > 0) {
      pair.persistence = Math.min(10, pair.persistence + 1);
      pair.confidence = Math.min(1, pair.persistence / 5);
    } else {
      pair.persistence = Math.max(0, pair.persistence - 1);
      pair.confidence = Math.max(0, pair.confidence - 0.1);
    }

    if (!this.spreadHistory.has(label)) this.spreadHistory.set(label, []);
    const history = this.spreadHistory.get(label)!;
    history.push({ spread: spreadPct, dex, timestamp: Date.now() });
    if (history.length > this.SPREAD_HISTORY_LIMIT) history.shift();

    this.updateVolatility(label);
    this.updatePriority(label);
  }

  recordMiss(label: string): void {
    const pair = this.pairs.get(label);
    if (!pair) return;
    pair.skipCount++;
    pair.confidence = Math.max(0, pair.confidence - 0.05);
    pair.persistence = Math.max(0, pair.persistence - 1);

    if (pair.skipCount >= this.MAX_SKIP) {
      pair.enabled = false;
      logDebug(`PairState: ${label} deshabilitado — ${pair.skipCount} misses`);
    }
    this.updatePriority(label);
  }

  private updateVolatility(label: string): void {
    const history = this.spreadHistory.get(label);
    if (!history || history.length < 5) return;

    const recent = history.slice(-20);
    const spreads = recent.map((h) => h.spread);
    const avg = spreads.reduce((a, b) => a + b, 0) / spreads.length;
    const variance = spreads.reduce((sq, v) => sq + Math.pow(v - avg, 2), 0) / spreads.length;
    const pair = this.pairs.get(label);
    if (pair) pair.volatility = Math.sqrt(variance);
  }

  private updatePriority(label: string): void {
    const pair = this.pairs.get(label);
    if (!pair) return;

    let priority = 1.0;
    priority += pair.confidence * 0.3;
    priority -= pair.skipCount * 0.05;
    priority = Math.max(0.1, Math.min(1.5, priority));
    pair.priority = priority;
  }

  getPair(label: string): MonitoredPair | undefined {
    return this.pairs.get(label);
  }

  getEnabledPairs(): MonitoredPair[] {
    return Array.from(this.pairs.values())
      .filter((p) => p.enabled)
      .sort((a, b) => b.priority - a.priority);
  }

  getActivePairs(): MonitoredPair[] {
    const now = Date.now();
    return this.getEnabledPairs().filter((p) => now - p.lastUpdate < 30000);
  }

  getBestPair(): MonitoredPair | null {
    const active = this.getActivePairs();
    if (active.length === 0) return null;
    return active.reduce((best, p) => p.confidence > best.confidence ? p : best);
  }

  enable(label: string): void {
    const pair = this.pairs.get(label);
    if (pair) { pair.enabled = true; pair.skipCount = 0; }
  }

  reset(): void {
    for (const pair of this.pairs.values()) {
      pair.enabled = true;
      pair.priority = 1.0;
      pair.skipCount = 0;
      pair.confidence = 0;
      pair.persistence = 0;
    }
  }
}

export const pairState = new PairStateManager();
