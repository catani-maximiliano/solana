export type CrowdingLevel = "PRIVATE" | "LOW_VIS" | "MEDIUM_VIS" | "CROWDED" | "MEV_SWARM";

export interface CompetitionEstimate {
  estimatedBots: number;
  density: "LOW" | "MEDIUM" | "HIGH";
  confidence: number;
}

export interface FrontrunRisk {
  probability: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  visibilityScore: number;
}

export interface BundleLikelihood {
  probability: number;
  estimatedBundles: number;
}

export interface ExecutionRaceResult {
  winProbability: number;
  latencyAdvantage: number;
  competitionPenalty: number;
  slotPosition: number;
}

export interface AdversarialScore {
  total: number;
  competition: number;
  frontrun: number;
  crowding: number;
  bundleLikelihood: number;
  mevPressure: number;
  winProb: number;
}
