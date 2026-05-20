import { persistenceTracker } from "../microstructure/persistenceTracker";
import { velocityTracker } from "../flow/velocityTracker";
import { volatilityWindow } from "../microstructure/volatilityWindow";
import { SurvivalEstimate } from "./types";

export function estimateSurvival(pair: string, pool: string): SurvivalEstimate {
  const persist = persistenceTracker.getScore(pair);
  const velocity = persistenceTracker.getVelocity(pair);
  const decay = persistenceTracker.getDecay(pair);
  const vol = volatilityWindow.getSnapshot(pair);

  // Base survival from persistence
  let base = 500 * persist;

  // Positive velocity (widening) extends survival
  if (velocity > 0) base += 200;

  // Negative decay shortens survival
  if (decay < -1) base = Math.max(50, base + decay * 50);

  // Volatility penalty
  if (vol.regime === "HIGH") base *= 0.6;
  if (vol.regime === "EXTREME") base *= 0.3;

  const expectedMs = Math.round(base);
  const p50 = Math.round(base * 0.7);
  const p95 = Math.round(base * 1.5);
  const decayRate = decay;

  return { expectedMs, p50, p95, decayRate };
}
