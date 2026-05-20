import { AnomalySignal } from "./types";
import { velocityTracker } from "../flow/velocityTracker";
import { volatilityWindow } from "../microstructure/volatilityWindow";
import { flowEngine } from "../flow/flowEngine";
import { toxicFlowDetector } from "../flow/toxicFlowDetector";

export function detectAnomaly(pool: string, pair: string): AnomalySignal {
  const accel = velocityTracker.getAcceleration(pool);
  const vol = volatilityWindow.getSnapshot(pair);
  const flow = flowEngine.getPoolFlow(pool);
  const toxic = toxicFlowDetector.detect(pool);

  let detected = false;
  let type = "none";
  let severity = 0;

  // Abnormal acceleration (>2x normal)
  if (accel > 2) { detected = true; type = "abnormal_acceleration"; severity = Math.min(1, accel / 5); }

  // Toxic burst
  if (toxic.toxicity === "TOXIC" && vol.burstDetected) { detected = true; type = "toxic_burst"; severity = 0.8; }

  // Extreme flow imbalance with velocity
  if (flow && (flow.buyRatio > 0.85 || flow.buyRatio < 0.15) && velocityTracker.getVelocity(pool) > 100) {
    detected = true; type = "extreme_flow_imbalance"; severity = 0.7;
  }

  return {
    detected,
    type,
    severity: Math.round(severity * 100) / 100,
    description: detected ? `${type} (sev=${severity.toFixed(2)})` : "none",
  };
}
