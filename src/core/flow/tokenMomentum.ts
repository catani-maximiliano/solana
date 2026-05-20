import { TokenMomentum } from "./types";
import { velocityTracker } from "./velocityTracker";
import { persistenceTracker } from "../microstructure/persistenceTracker";

export function computeTokenMomentum(token: string): TokenMomentum {
  const vel = velocityTracker.getVelocity(token);
  const accel = velocityTracker.getAcceleration(token);
  const freq = velocityTracker.getFrequency(token);
  const spike = velocityTracker.hasVolumeSpike(token);
  const persist = persistenceTracker.getScore(token);

  return {
    token,
    velocity: Math.round(vel * 100) / 100,
    acceleration: Math.round(accel * 100) / 100,
    tradeFrequency: Math.round(freq * 10) / 10,
    volumeSpike: spike,
    spreadPersistence: persist,
  };
}
