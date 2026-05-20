import { RollbackRisk } from "./types";

export function estimateRollbackRisk(
  volatility: string,
  slotLag: number,
): RollbackRisk {
  const orphanProb = volatility === "EXTREME" ? 0.05 : volatility === "HIGH" ? 0.02 : 0.005;
  const reorgProb = volatility === "EXTREME" ? 0.1 : volatility === "HIGH" ? 0.04 : 0.01;

  let confirmationRisk: "LOW" | "MEDIUM" | "HIGH" = "LOW";
  if (volatility === "EXTREME" || slotLag > 50) confirmationRisk = "HIGH";
  else if (volatility === "HIGH" || slotLag > 20) confirmationRisk = "MEDIUM";

  return {
    orphanProb: Math.round(orphanProb * 1000) / 1000,
    reorgProb: Math.round(reorgProb * 100) / 100,
    confirmationRisk,
  };
}
