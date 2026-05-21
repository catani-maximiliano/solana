import { PoolState, PoolFreshness } from "./types";
import { logInfo, logWarning } from "../../logger";

const FRESH_AGE_MAX_MS = 1500;
const STALE_AGE_MAX_MS = 5000;
const DEAD_AGE_MAX_MS = 5000;
const MAX_SLOT_DELTA = 8;
const MAX_TRACKED_POOLS = 100;

export class PoolFreshnessTracker {
  private pools = new Map<string, PoolFreshness>();
  private transitionLog: string[] = [];

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

    const slotDelta = currentSlot > 0 && slot > 0 ? Math.abs(currentSlot - slot) : 999;
    const newState = this.determineState(ageMs, slot, slotDelta, price, liquidity);

    if (!prev) {
      const entry: PoolFreshness = {
        poolAddress,
        dex,
        state: newState,
        ageMs,
        slot,
        slotDelta,
        price,
        liquidity,
        lastEventTime: Date.now(),
        consecutiveFailures: newState === PoolState.CORRUPT ? 1 : 0,
        transitionCount: 0,
        lastTransition: Date.now(),
      };
      this.pools.set(poolAddress, entry);
      this.logTransition(poolAddress, dex, PoolState.DEAD, newState, ageMs);
      return newState;
    }

    prev.ageMs = ageMs;
    prev.slot = slot;
    prev.slotDelta = slotDelta;
    prev.price = price;
    prev.liquidity = liquidity;
    prev.lastEventTime = Date.now();

    if (newState === PoolState.FRESH) prev.consecutiveFailures = 0;

    if (newState !== prevState) {
      prev.transitionCount++;
      prev.lastTransition = Date.now();
      prev.state = newState;
      this.logTransition(poolAddress, dex, prevState, newState, ageMs);
    } else if (newState === PoolState.CORRUPT) {
      prev.consecutiveFailures++;
    }

    return newState;
  }

  private determineState(
    ageMs: number,
    slot: number,
    slotDelta: number,
    price: number,
    liquidity: number,
  ): PoolState {
    if (price <= 0 || !isFinite(price)) return PoolState.CORRUPT;
    if (liquidity <= 0 || !isFinite(liquidity)) return PoolState.CORRUPT;
    if (slot === 0) return PoolState.DEAD;
    if (ageMs <= FRESH_AGE_MAX_MS && slotDelta <= MAX_SLOT_DELTA) return PoolState.FRESH;
    if (ageMs <= STALE_AGE_MAX_MS) return PoolState.STALE;
    if (ageMs > DEAD_AGE_MAX_MS) return PoolState.DEAD;
    return PoolState.STALE;
  }

  forceMarkDead(poolAddress: string, reason: string): void {
    const prev = this.pools.get(poolAddress);
    if (prev && prev.state !== PoolState.DEAD) {
      const oldState = prev.state;
      prev.state = PoolState.DEAD;
      prev.transitionCount++;
      prev.lastTransition = Date.now();
      this.logTransition(poolAddress, prev.dex, oldState, PoolState.DEAD, -1);
      logWarning(`[FRESHNESS] force DEAD ${poolAddress.substring(0, 8)}... — ${reason}`);
    }
  }

  forceMarkCorrupt(poolAddress: string, reason: string): void {
    const prev = this.pools.get(poolAddress);
    if (prev && prev.state !== PoolState.CORRUPT) {
      const oldState = prev.state;
      prev.state = PoolState.CORRUPT;
      prev.consecutiveFailures++;
      prev.transitionCount++;
      prev.lastTransition = Date.now();
      this.logTransition(poolAddress, prev.dex, oldState, PoolState.CORRUPT, -1);
      logWarning(`[FRESHNESS] force CORRUPT ${poolAddress.substring(0, 8)}... — ${reason}`);
    }
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

  getPoolAddressesByState(state: PoolState): string[] {
    return Array.from(this.pools.entries())
      .filter(([, f]) => f.state === state)
      .map(([addr]) => addr);
  }

  getValidExecutionPools(): string[] {
    return Array.from(this.pools.entries())
      .filter(([, f]) => f.state === PoolState.FRESH)
      .map(([addr]) => addr);
  }

  private logTransition(
    poolAddress: string,
    dex: string,
    from: PoolState,
    to: PoolState,
    ageMs: number,
  ): void {
    const prefix = from === PoolState.DEAD && to === PoolState.FRESH ? "" : "⚠️ ";
    const ageStr = ageMs >= 0 ? ` age=${(ageMs / 1000).toFixed(1)}s` : "";
    if (from !== to) {
      logInfo(`[FRESHNESS] ${prefix}${dex} ${poolAddress.substring(0, 8)}... → ${to}${ageStr}`);
    }
  }

  logAllStates(): void {
    const counts: Record<string, number> = {};
    for (const f of this.pools.values()) {
      counts[f.state] = (counts[f.state] || 0) + 1;
    }
    logInfo(`[FRESHNESS] pools: FRESH=${counts.FRESH ?? 0} STALE=${counts.STALE ?? 0} DEAD=${counts.DEAD ?? 0} CORRUPT=${counts.CORRUPT ?? 0}`);
    for (const f of this.pools.values()) {
      if (f.state !== PoolState.FRESH) {
        logInfo(`  ${f.dex} ${f.poolAddress.substring(0, 8)}... → ${f.state} age=${(f.ageMs / 1000).toFixed(1)}s slot=${f.slot}`);
      }
    }
  }

  clear(): void {
    this.pools.clear();
    this.transitionLog = [];
  }
}

export const poolFreshnessTracker = new PoolFreshnessTracker();
