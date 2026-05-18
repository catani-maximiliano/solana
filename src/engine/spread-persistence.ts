import { SpreadPersistence } from "./types";
import { logDebug } from "../logger";

const PERSISTENCE_WINDOW = 60_000;
const STALE_TIMEOUT = 30_000;

export class SpreadPersistenceTracker {
  private spreads = new Map<string, SpreadPersistence>();
  private totalObservations = 0;
  private totalPersistences = 0;

  observe(key: string, active: boolean): void {
    this.totalObservations++;

    if (active) {
      const existing = this.spreads.get(key);
      if (existing) {
        existing.lastSeen = Date.now();
        existing.active = true;
      } else {
        this.spreads.set(key, {
          key,
          firstSeen: Date.now(),
          lastSeen: Date.now(),
          lifetimeMs: 0,
          avgLifetimeMs: 0,
          sampleCount: 0,
          active: true,
        });
      }
    } else {
      const existing = this.spreads.get(key);
      if (existing && existing.active) {
        const now = Date.now();
        const lifetime = now - existing.firstSeen;
        existing.lifetimeMs = lifetime;
        existing.active = false;
        existing.sampleCount++;
        existing.avgLifetimeMs = existing.avgLifetimeMs * (existing.sampleCount - 1) / existing.sampleCount + lifetime / existing.sampleCount;
        this.totalPersistences++;
        logDebug(`Spread persistence: ${key} lived ${lifetime}ms (avg ${existing.avgLifetimeMs.toFixed(0)}ms, ${existing.sampleCount} samples)`);
      }
    }

    this.prune();
  }

  getPersistence(key: string): SpreadPersistence | undefined {
    return this.spreads.get(key);
  }

  getAverageLifetime(): number {
    if (this.totalPersistences === 0) return 0;
    let total = 0;
    let count = 0;
    for (const [, s] of this.spreads) {
      if (s.sampleCount > 0) {
        total += s.avgLifetimeMs * s.sampleCount;
        count += s.sampleCount;
      }
    }
    return count > 0 ? total / count : 0;
  }

  getActiveCount(): number {
    let count = 0;
    for (const [, s] of this.spreads) {
      if (s.active) count++;
    }
    return count;
  }

  getStats() {
    return {
      totalSpreads: this.spreads.size,
      activeSpreads: this.getActiveCount(),
      totalObservations: this.totalObservations,
      totalPersistences: this.totalPersistences,
      avgLifetimeMs: this.getAverageLifetime(),
    };
  }

  private prune(): void {
    const cutoff = Date.now() - PERSISTENCE_WINDOW;
    for (const [key, s] of this.spreads) {
      if (!s.active && s.lastSeen < cutoff) {
        this.spreads.delete(key);
      }
      if (s.active && Date.now() - s.lastSeen > STALE_TIMEOUT) {
        s.active = false;
        const lifetime = s.lastSeen - s.firstSeen;
        s.lifetimeMs = lifetime;
        s.sampleCount++;
        s.avgLifetimeMs = s.avgLifetimeMs * (s.sampleCount - 1) / s.sampleCount + lifetime / s.sampleCount;
      }
    }
  }

  reset(): void {
    this.spreads.clear();
    this.totalObservations = 0;
    this.totalPersistences = 0;
  }
}

export const spreadPersistence = new SpreadPersistenceTracker();
