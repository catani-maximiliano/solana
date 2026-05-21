import { PoolState, PoolFreshness } from "./types";
import { logInfo, logWarning } from "../../logger";

const MAX_TRACKED_POOLS = 100;

const DEX_FRESH_THRESHOLDS: Record<string, { freshMs: number; staleMs: number; deadMs: number }> = {
  Whirlpool: { freshMs: 1500, staleMs: 5000, deadMs: 5000 },
  "Raydium CLMM": { freshMs: 1500, staleMs: 3000, deadMs: 3000 },
  default: { freshMs: 1500, staleMs: 2000, deadMs: 2000 },
};

function getThresholds(dex: string): { freshMs: number; staleMs: number; deadMs: number } {
  return DEX_FRESH_THRESHOLDS[dex] || DEX_FRESH_THRESHOLDS.default;
}

export class PoolFreshnessTracker {
  private pools = new Map<string, PoolFreshness>();

  recordUpdate(
    poolAddress: string,
    dex: string,
    ageMs: number,
    slot: number,
    currentSlot: number,
    price: number,
    liquidity: number,
  ): PoolState {
    const prev = this.pools.get(poolAddress);
    const prevState = prev?.state ?? PoolState.DEAD;
    const t = getThresholds(dex);
    const slotDelta = currentSlot > 0 && slot > 0 ? Math.abs(currentSlot - slot) : 0;
    const newState = this.determineState(ageMs, slot, price, liquidity, t);

    const now = Date.now();
    if (!prev) {
      const entry: PoolFreshness = {
        poolAddress, dex,
        state: newState, ageMs, slot, slotDelta,
        price, liquidity,
        lastEventTime: now,
        consecutiveFailures: newState === PoolState.CORRUPT ? 1 : 0,
        transitionCount: 0, lastTransition: now,
      };
      this.pools.set(poolAddress, entry);
      this.logState(entry);
      return newState;
    }

    prev.ageMs = ageMs;
    prev.slot = slot;
    prev.slotDelta = slotDelta;
    prev.price = price;
    prev.liquidity = liquidity;
    prev.lastEventTime = now;

    if (newState === PoolState.FRESH) prev.consecutiveFailures = 0;

    if (newState !== prevState) {
      prev.transitionCount++;
      prev.lastTransition = now;
      prev.state = newState;
      this.logState(prev);
    } else if (newState === PoolState.CORRUPT) {
      prev.consecutiveFailures++;
    }

    return newState;
  }

  private determineState(
    ageMs: number, slot: number, price: number, liquidity: number,
    t: { freshMs: number; staleMs: number },
  ): PoolState {
    if (price <= 0 || !isFinite(price)) return PoolState.CORRUPT;
    if (liquidity <= 0 || !isFinite(liquidity)) return PoolState.CORRUPT;
    if (slot === 0) return PoolState.DEAD;
    if (ageMs <= t.freshMs) return PoolState.FRESH;
    if (ageMs <= t.staleMs) return PoolState.STALE;
    return PoolState.DEAD;
  }

  forceMarkDead(poolAddress: string, reason: string): void {
    const prev = this.pools.get(poolAddress);
    if (prev && prev.state !== PoolState.DEAD) {
      prev.state = PoolState.DEAD;
      prev.transitionCount++;
      prev.lastTransition = Date.now();
      this.logTransition(prev, "force DEAD", reason);
    }
  }

  forceMarkCorrupt(poolAddress: string, reason: string): void {
    const prev = this.pools.get(poolAddress);
    if (prev && prev.state !== PoolState.CORRUPT) {
      prev.state = PoolState.CORRUPT;
      prev.consecutiveFailures++;
      prev.transitionCount++;
      prev.lastTransition = Date.now();
      this.logTransition(prev, "force CORRUPT", reason);
    }
  }

  private logState(f: PoolFreshness): void {
    logInfo(`[FRESHNESS] ${f.dex} ${f.poolAddress.substring(0, 8)}... → ${f.state} age=${(f.ageMs / 1000).toFixed(1)}s slot=${f.slot} slotΔ=${f.slotDelta} price=${f.price.toExponential(3)} liq=${f.liquidity.toExponential(3)}`);
  }

  private logTransition(f: PoolFreshness, action: string, detail: string): void {
    logWarning(`[FRESHNESS] ${action} ${f.dex} ${f.poolAddress.substring(0, 8)}... — ${detail}`);
  }

  getState(poolAddress: string): PoolState {
    return this.pools.get(poolAddress)?.state ?? PoolState.DEAD;
  }

  getFreshness(poolAddress: string): PoolFreshness | undefined {
    return this.pools.get(poolAddress);
  }

  getAllFreshness(): PoolFreshness[] {
    return Array.from(this.pools.values());
  }

  getFreshCount(): number {
    return Array.from(this.pools.values()).filter((f) => f.state === PoolState.FRESH).length;
  }

  getStaleCount(): number {
    return Array.from(this.pools.values()).filter((f) => f.state === PoolState.STALE).length;
  }

  getDeadCount(): number {
    return Array.from(this.pools.values()).filter((f) => f.state === PoolState.DEAD).length;
  }

  getCorruptCount(): number {
    return Array.from(this.pools.values()).filter((f) => f.state === PoolState.CORRUPT).length;
  }

  getStaleRatio(dex: string): number {
    const entries = Array.from(this.pools.values()).filter((f) => f.dex === dex);
    if (entries.length === 0) return 0;
    const stale = entries.filter((f) => f.state === PoolState.STALE || f.state === PoolState.DEAD || f.state === PoolState.CORRUPT).length;
    return stale / entries.length;
  }

  clear(): void {
    this.pools.clear();
  }
}

export const poolFreshnessTracker = new PoolFreshnessTracker();
