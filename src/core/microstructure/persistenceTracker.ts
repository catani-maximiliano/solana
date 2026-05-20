import { logDebug } from "../../logger";

interface SpreadRecord {
  spreadBps: number;
  timestamp: number;
}

interface PersistenceState {
  key: string;
  records: SpreadRecord[];
  firstSeen: number;
  lastSeen: number;
  peakSpread: number;
}

const MAX_RECORDS = 50;
const DECAY_WINDOW_MS = 30_000;
const MIN_PERSISTENCE_MS = 500;

export class PersistenceTracker {
  private states = new Map<string, PersistenceState>();

  /** Record a spread observation for a pair */
  record(key: string, spreadBps: number): number {
    const now = Date.now();
    let state = this.states.get(key);
    if (!state) {
      state = { key, records: [], firstSeen: now, lastSeen: now, peakSpread: spreadBps };
      this.states.set(key, state);
    }

    state.records.push({ spreadBps, timestamp: now });
    state.lastSeen = now;
    if (spreadBps > state.peakSpread) state.peakSpread = spreadBps;

    // Prune old records
    if (state.records.length > MAX_RECORDS) state.records.shift();

    this.prune();
    return this.getScore(key);
  }

  /** Get persistence score (0-1) for a key */
  getScore(key: string): number {
    const state = this.states.get(key);
    if (!state) return 0;

    const lifetime = state.lastSeen - state.firstSeen;
    if (lifetime < MIN_PERSISTENCE_MS) return lifetime / MIN_PERSISTENCE_MS;

    // More records = more persistent
    const recordScore = Math.min(1, state.records.length / 10);

    // Longer lifetime = more persistent
    const lifetimeScore = Math.min(1, lifetime / DECAY_WINDOW_MS);

    return (recordScore * 0.5 + lifetimeScore * 0.5);
  }

  /** Get spread velocity (bps change per second) */
  getVelocity(key: string): number {
    const state = this.states.get(key);
    if (!state || state.records.length < 2) return 0;
    const first = state.records[0];
    const last = state.records[state.records.length - 1];
    const elapsed = (last.timestamp - first.timestamp) / 1000;
    if (elapsed <= 0) return 0;
    return (last.spreadBps - first.spreadBps) / elapsed;
  }

  /** Get spread decay (negative = shrinking opportunity) */
  getDecay(key: string): number {
    const state = this.states.get(key);
    if (!state || state.records.length < 3) return 0;
    const recent = state.records.slice(-3);
    const first = recent[0].spreadBps;
    const last = recent[recent.length - 1].spreadBps;
    return last - first;
  }

  /** Check if a candidate has persisted long enough to be actionable */
  isActionable(key: string, minPersistenceMs = 500): boolean {
    const state = this.states.get(key);
    if (!state) return false;
    return (state.lastSeen - state.firstSeen) >= minPersistenceMs && this.getDecay(key) > -2;
  }

  private prune(): void {
    const cutoff = Date.now() - DECAY_WINDOW_MS;
    for (const [key, state] of this.states) {
      if (state.lastSeen < cutoff) this.states.delete(key);
    }
  }

  reset(): void {
    this.states.clear();
  }
}

export const persistenceTracker = new PersistenceTracker();
