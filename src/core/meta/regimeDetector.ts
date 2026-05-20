import { RegimeType } from "./types";
import { volatilityWindow } from "../microstructure/volatilityWindow";
import { competitionEngine } from "../adversarial/competitionEngine";

export function detectRegime(pair: string, pool: string): RegimeType {
  const vol = volatilityWindow.getSnapshot(pair);
  const comp = competitionEngine.estimate(pair, 0);

  const volatility = vol.regime;
  const crowding = comp.density;

  let name: string;
  if (volatility === "EXTREME") name = "MEV_SWARM";
  else if (volatility === "HIGH" && crowding === "HIGH") name = "TOXIC";
  else if (volatility === "HIGH") name = "HIGH_VOL";
  else if (volatility === "LOW" && crowding === "LOW") name = "LOW_VOL";
  else name = "NEUTRAL";

  return { name, volatility, crowding, description: `${name} vol=${volatility} crowding=${crowding}` };
}
