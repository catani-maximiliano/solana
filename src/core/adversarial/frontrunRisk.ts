import { FrontrunRisk } from "./types";
import { toxicFlowDetector } from "../flow/toxicFlowDetector";

export function estimateFrontrunRisk(pool: string, spreadBps: number): FrontrunRisk {
  const toxic = toxicFlowDetector.detect(pool);

  // Spread visibility: higher spreads attract more frontrunning
  const visibilityScore = Math.min(1, spreadBps / 50);

  // Toxic flow increases frontrun risk
  const toxicMultiplier = toxic.toxicity === "TOXIC" ? 1.8 : toxic.toxicity === "RISKY" ? 1.3 : 1;

  const probability = Math.min(0.9, visibilityScore * toxicMultiplier * 0.6);

  let riskLevel: "LOW" | "MEDIUM" | "HIGH" = "LOW";
  if (probability > 0.5) riskLevel = "HIGH";
  else if (probability > 0.25) riskLevel = "MEDIUM";

  return {
    probability: Math.round(probability * 100) / 100,
    riskLevel,
    visibilityScore: Math.round(visibilityScore * 100) / 100,
  };
}
