import { RiskAssessment } from "./types";

export function assessRisk(
  totalLatencyMs: number,
  liquidity: number,
  spreadBps: number,
  toxicityScore: number,
  volatilityRegime: string,
): RiskAssessment {
  const latencyRisk = Math.min(1, totalLatencyMs / 2000);
  const competitionRisk = Math.min(1, spreadBps / 80);
  const liquidityRisk = Math.max(0, 1 - Math.min(1, liquidity / 2_000_000));
  const toxicityRisk = toxicityScore;

  let overall: "LOW" | "MEDIUM" | "HIGH" = "LOW";
  const combined = latencyRisk + competitionRisk + liquidityRisk + toxicityRisk;
  if (combined > 2.5 || volatilityRegime === "EXTREME") overall = "HIGH";
  else if (combined > 1.5) overall = "MEDIUM";

  return {
    overall,
    latencyRisk: Math.round(latencyRisk * 100) / 100,
    competitionRisk: Math.round(competitionRisk * 100) / 100,
    liquidityRisk: Math.round(liquidityRisk * 100) / 100,
    toxicityRisk: Math.round(toxicityRisk * 100) / 100,
  };
}
