import { logDebug } from "../logger";

const DEDUP_CACHE_SIZE = 1000;
const DEDUP_TTL_MS = 60_000;

export class EventDeduplicator {
  private seen = new Map<string, number>();
  public duplicateCount = 0;

  isDuplicate(dedupKey: string): boolean {
    const now = Date.now();
    const last = this.seen.get(dedupKey);
    if (last && now - last < DEDUP_TTL_MS) {
      this.duplicateCount++;
      logDebug(`Dedup: suppressed event ${dedupKey.substring(0, 40)}...`);
      return true;
    }
    this.seen.set(dedupKey, now);

    // Evict stale entries
    if (this.seen.size > DEDUP_CACHE_SIZE) {
      for (const [k, v] of this.seen) {
        if (now - v > DEDUP_TTL_MS) this.seen.delete(k);
      }
    }
    return false;
  }

  reset(): void {
    this.seen.clear();
    this.duplicateCount = 0;
  }
}

export const eventDeduplicator = new EventDeduplicator();
