import { MomentumSignal } from "./types";
import { velocityTracker } from "../flow/velocityTracker";
import { flowEngine } from "../flow/flowEngine";
import { imbalanceDetector } from "../orderbook/imbalanceDetector";

export function predictMomentum(market: string, pool: string): MomentumSignal {
  const accel = velocityTracker.getAcceleration(pool);
  const flow = flowEngine.getPoolFlow(pool);
  const imbalance = imbalanceDetector.detect(market);

  let strength = 0;
  let direction: "CONTINUE" | "REVERT" | "NEUTRAL" = "NEUTRAL";

  // Positive acceleration + buy pressure = continue up
  if (accel > 0.3 && flow && flow.buyRatio > 0.55) {
    direction = "CONTINUE";
    strength = Math.min(1, accel * 0.5 + (flow.buyRatio - 0.5) * 2);
  }

  // Negative acceleration + sell pressure = continue down
  if (accel < -0.3 && flow && flow.buyRatio < 0.45) {
    direction = "CONTINUE";
    strength = Math.min(1, Math.abs(accel) * 0.5 + (0.5 - flow.buyRatio) * 2);
  }

  // Extreme imbalance without acceleration = likely revert
  if (imbalance.sustained && Math.abs(accel) < 0.1) {
    direction = "REVERT";
    strength = 0.6;
  }

  return { direction, strength: Math.round(strength * 100) / 100 };
}
