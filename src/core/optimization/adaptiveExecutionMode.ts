import { AdaptiveMode } from "./types";

export function getAdaptiveMode(
  regime: string,
  congestion: string,
  competition: string,
  recentCaptureRate: number,
): AdaptiveMode {
  let aggressiveness = 0.5;
  let feePolicy = "normal";
  let recommendedTiming = "WAIT_100MS";
  let sendStrategy = "single";

  // Low capture rate → conservative
  if (recentCaptureRate < 20) { aggressiveness = 0.3; feePolicy = "aggressive"; sendStrategy = "multi_relay"; }
  if (recentCaptureRate > 40) { aggressiveness = 0.7; feePolicy = "normal"; }

  // Regime adjustments
  if (regime === "HIGH_VOL") { aggressiveness = 0.8; recommendedTiming = "FIRE_NOW"; }
  if (regime === "LOW_VOL") { aggressiveness = 0.4; recommendedTiming = "WAIT_250MS"; }
  if (regime === "MEV_SWARM") { aggressiveness = 0.1; sendStrategy = "bundle_only"; }

  // Congestion
  if (congestion === "HIGH") { feePolicy = "aggressive"; sendStrategy = "multi_relay"; }

  // Competition
  if (competition === "HIGH") { aggressiveness *= 0.7; feePolicy = "aggressive"; }

  return {
    aggressiveness: Math.round(aggressiveness * 100) / 100,
    feePolicy,
    recommendedTiming,
    sendStrategy,
  };
}
