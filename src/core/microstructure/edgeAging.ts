import { priceGraph } from "../../graph";
import { EdgeAgeInfo } from "./types";
import { logDebug } from "../../logger";

const EDGE_FRESH_MS = 5_000;
const EDGE_DECAY_MS = 30_000;
const MIN_UPDATES_FOR_ACTIVE = 3;

export class EdgeAging {
  private updateHistory = new Map<string, number[]>();

  /** Record an edge update */
  recordEdge(pool: string): void {
    const now = Date.now();
    const history = this.updateHistory.get(pool) || [];
    history.push(now);
    this.updateHistory.set(pool, history.slice(-20)); // keep last 20
  }

  /** Get aging info for a pool edge */
  getEdgeAge(pool: string): EdgeAgeInfo {
    const history = this.updateHistory.get(pool) || [];
    const now = Date.now();
    const lastUpdate = history.length > 0 ? history[history.length - 1] : 0;
    const createdAt = history.length > 0 ? history[0] : now;
    const age = lastUpdate > 0 ? now - lastUpdate : Infinity;

    // Update frequency (updates per second over lifetime)
    const lifetime = now - createdAt;
    const updateFrequency = lifetime > 0 && history.length > 0 ? history.length / (lifetime / 1000) : 0;

    // Decay score: 0 (fresh) → 1 (dead)
    const decayScore = age > EDGE_DECAY_MS ? 1 : age > EDGE_FRESH_MS ? (age - EDGE_FRESH_MS) / (EDGE_DECAY_MS - EDGE_FRESH_MS) : 0;

    // Freshness score: 1 (fresh) → 0 (stale)
    const freshnessScore = Math.max(0, 1 - age / EDGE_FRESH_MS);

    const active = history.length >= MIN_UPDATES_FOR_ACTIVE && age < EDGE_DECAY_MS;

    return { pool, createdAt, lastUpdate, updateFrequency: Math.round(updateFrequency * 100) / 100, decayScore, freshnessScore, active };
  }

  /** Check if an edge is still fresh */
  isFresh(pool: string): boolean {
    const info = this.getEdgeAge(pool);
    return info.freshnessScore > 0;
  }

  reset(): void {
    this.updateHistory.clear();
  }
}

export const edgeAging = new EdgeAging();
