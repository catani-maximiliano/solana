import { SpreadPrediction, EdgeHalfLife } from "./types";
import { persistenceTracker } from "../microstructure/persistenceTracker";

class HalfLifeTracker {
  private lifetimes = new Map<string, number[]>();

  record(key: string, lifetimeMs: number): void {
    const list = this.lifetimes.get(key) || [];
    list.push(lifetimeMs);
    this.lifetimes.set(key, list.slice(-100));
  }

  getHalfLife(key: string): EdgeHalfLife {
    const list = this.lifetimes.get(key) || [];
    if (list.length < 3) return { p50: 0, p75: 0, p95: 0, samples: list.length };
    const sorted = [...list].sort((a, b) => a - b);
    return {
      p50: sorted[Math.floor(sorted.length * 0.5)] || 0,
      p75: sorted[Math.floor(sorted.length * 0.75)] || 0,
      p95: sorted[Math.floor(sorted.length * 0.95)] || 0,
      samples: list.length,
    };
  }
}

export const halfLifeTracker = new HalfLifeTracker();

/**
 * Predict whether a spread edge will persist.
 */
export function predictSpreadPersistence(key: string, currentSpread: number): SpreadPrediction {
  const persist = persistenceTracker.getScore(key);
  const velocity = persistenceTracker.getVelocity(key);
  const decay = persistenceTracker.getDecay(key);
  const halfLife = halfLifeTracker.getHalfLife(key);

  // Base probability from persistence score
  let prob = persist;

  // Positive velocity = widening spread = more likely to persist
  if (velocity > 0) prob += 0.1;

  // Negative decay = shrinking = less likely to persist
  if (decay < -1) prob -= 0.2;

  const expectedSurvivalMs = halfLife.p50 > 0 ? halfLife.p50 : 500;
  const decayRate = decay;
  const confidence = Math.min(1, Math.max(0, prob));

  return {
    persistenceProbability: Math.round(prob * 100) / 100,
    expectedSurvivalMs,
    decayRate,
    confidence,
  };
}

export function recordEdgeLifetime(key: string, lifetimeMs: number): void {
  halfLifeTracker.record(key, lifetimeMs);
}
