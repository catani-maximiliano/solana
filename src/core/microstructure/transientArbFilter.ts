import { persistenceTracker } from "./persistenceTracker";

const MIN_PERSISTENCE_MS = 500;
const MAX_DECAY_BPS = -3; // if spread decays more than this in 3 samples, reject

/**
 * Filter out transient arbitrage opportunities that are unlikely to be executable.
 * Returns true if the opportunity should be REJECTED.
 */
export function isTransientArb(key: string, spreadBps: number): boolean {
  const state = persistenceTracker.getScore(key);
  const decay = persistenceTracker.getDecay(key);

  // Too new: hasn't persisted long enough
  if (state < 0.3 && decay < MAX_DECAY_BPS) return true;

  // Negative decay = opportunity shrinking
  if (decay < MAX_DECAY_BPS) {
    return true;
  }

  return false;
}

/** Check if opportunity is actionable (persisted + not decaying too fast) */
export function isActionableSpread(key: string, spreadBps: number): boolean {
  return !isTransientArb(key, spreadBps);
}
