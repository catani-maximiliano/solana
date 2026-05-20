const MAX_CACHE = 5000;
const TTL_MS = 60_000;

export class NlnDeduplicator {
  private seen = new Map<string, number>();
  private lastSlotPerPool = new Map<string, number>();

  public duplicatesSuppressed = 0;
  public oldEventsIgnored = 0;

  /** Check if event is a duplicate (same signature within TTL) */
  isDuplicate(signature: string): boolean {
    if (!signature) return false;
    const now = Date.now();
    const last = this.seen.get(signature);
    if (last && now - last < TTL_MS) {
      this.duplicatesSuppressed++;
      return true;
    }
    this.seen.set(signature, now);
    this.prune();
    return false;
  }

  /** Check if event slot is older than last seen for this pool (ordering protection) */
  isOldEvent(pool: string, slot: number): boolean {
    if (!pool || slot <= 0) return false;
    const lastSlot = this.lastSlotPerPool.get(pool) || 0;
    if (slot <= lastSlot) {
      this.oldEventsIgnored++;
      return true;
    }
    this.lastSlotPerPool.set(pool, slot);
    return false;
  }

  /** Get current last slot for a pool */
  getLastSlot(pool: string): number {
    return this.lastSlotPerPool.get(pool) || 0;
  }

  private prune(): void {
    if (this.seen.size <= MAX_CACHE) return;
    const now = Date.now();
    for (const [k, v] of this.seen) {
      if (now - v > TTL_MS) this.seen.delete(k);
    }
  }

  reset(): void {
    this.seen.clear();
    this.lastSlotPerPool.clear();
    this.duplicatesSuppressed = 0;
    this.oldEventsIgnored = 0;
  }
}

export const nlnDedup = new NlnDeduplicator();
