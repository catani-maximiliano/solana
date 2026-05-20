import { VolatilityForecast } from "./types";
import { volatilityWindow } from "../microstructure/volatilityWindow";
import { flowEngine } from "../flow/flowEngine";
import { makerTakerAnalyzer } from "../orderbook/makerTakerAnalyzer";

export function forecastVolatility(market: string, pool: string): VolatilityForecast {
  const vol = volatilityWindow.getSnapshot(market);
  const flow = flowEngine.getPoolFlow(pool);
  const taker = makerTakerAnalyzer.analyze(market);

  // Base from current regime
  let base = vol.regime === "LOW" ? 1 : vol.regime === "MEDIUM" ? 3 : vol.regime === "HIGH" ? 8 : 15;

  // Taker aggression boosts vol
  if (taker.takerRatio > 0.7) base *= 1.5;

  // Flow imbalance boosts vol
  if (flow && (flow.buyRatio > 0.7 || flow.buyRatio < 0.3)) base *= 1.3;

  // Decay over time (volatility mean reverts)
  const predicted1s = Math.round(base * 0.8 * 10) / 10;
  const predicted5s = Math.round(base * 0.5 * 10) / 10;
  const predicted30s = Math.round(base * 0.3 * 10) / 10;

  let regime: VolatilityForecast["regime"] = "LOW";
  const avg = (predicted1s + predicted5s + predicted30s) / 3;
  if (avg > 10) regime = "EXTREME";
  else if (avg > 5) regime = "HIGH";
  else if (avg > 2) regime = "MEDIUM";

  return { predicted1s, predicted5s, predicted30s, regime };
}
