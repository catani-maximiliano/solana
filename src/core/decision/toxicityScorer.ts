import { toxicFlowDetector } from "../flow/toxicFlowDetector";
import { volatilityWindow } from "../microstructure/volatilityWindow";
import { ToxicityReport } from "./types";

export function scoreToxicity(pool: string, pair: string): ToxicityReport {
  const toxic = toxicFlowDetector.detect(pool);
  const vol = volatilityWindow.getSnapshot(pair);

  const sandwichRisk = toxic.sandwichLikelihood;
  const spoofRisk = toxic.rapidInOut ? 0.6 : 0.1;
  const burstRisk = vol.burstDetected ? 0.8 : vol.regime === "HIGH" ? 0.5 : 0.1;

  const score = (sandwichRisk * 0.4 + spoofRisk * 0.3 + burstRisk * 0.3);

  let level: "SAFE" | "RISKY" | "TOXIC" = "SAFE";
  if (score > 0.6 || toxic.toxicity === "TOXIC") level = "TOXIC";
  else if (score > 0.3 || toxic.toxicity === "RISKY") level = "RISKY";

  return {
    level,
    sandwichRisk: Math.round(sandwichRisk * 100) / 100,
    spoofRisk: Math.round(spoofRisk * 100) / 100,
    burstRisk: Math.round(burstRisk * 100) / 100,
    score: Math.round(score * 100) / 100,
  };
}
