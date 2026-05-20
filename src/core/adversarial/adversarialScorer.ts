import { AdversarialScore, CompetitionEstimate, FrontrunRisk, BundleLikelihood, CrowdingLevel, ExecutionRaceResult } from "./types";

export function computeAdversarialScore(
  competition: CompetitionEstimate,
  frontrun: FrontrunRisk,
  bundle: BundleLikelihood,
  crowding: CrowdingLevel,
  race: ExecutionRaceResult,
): AdversarialScore {
  const compScore = competition.density === "HIGH" ? 0.8 : competition.density === "MEDIUM" ? 0.4 : 0.1;
  const frontrunScore = frontrun.riskLevel === "HIGH" ? 0.7 : frontrun.riskLevel === "MEDIUM" ? 0.35 : 0.1;
  const crowdScore = crowding === "MEV_SWARM" ? 0.9 : crowding === "CROWDED" ? 0.6 : crowding === "MEDIUM_VIS" ? 0.3 : 0.1;
  const bundleScore = bundle.probability;
  const mevPressure = (compScore + frontrunScore + crowdScore) / 3;

  const total = compScore * 0.25 + frontrunScore * 0.2 + crowdScore * 0.2 + bundleScore * 0.15 + (1 - race.winProbability) * 0.2;

  return {
    total: Math.round(total * 100),
    competition: Math.round(compScore * 100),
    frontrun: Math.round(frontrunScore * 100),
    crowding: Math.round(crowdScore * 100),
    bundleLikelihood: Math.round(bundleScore * 100),
    mevPressure: Math.round(mevPressure * 100),
    winProb: Math.round(race.winProbability * 100),
  };
}
