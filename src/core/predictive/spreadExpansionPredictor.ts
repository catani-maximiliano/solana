import { SpreadExpansionSignal } from "./types";
import { volatilityWindow } from "../microstructure/volatilityWindow";
import { makerTakerAnalyzer } from "../orderbook/makerTakerAnalyzer";
import { velocityTracker } from "../flow/velocityTracker";

export function predictSpreadExpansion(market: string, pool: string, currentSpreadBps: number): SpreadExpansionSignal {
  const vol = volatilityWindow.getSnapshot(market);
  const flow = makerTakerAnalyzer.analyze(market);
  const velocity = velocityTracker.getVelocity(pool);

  let expansion = 0;
  let direction: "WIDEN" | "NARROW" = "NARROW";

  // Volatility drives spreads wider
  if (vol.regime === "HIGH") expansion += currentSpreadBps * 0.3;
  if (vol.regime === "EXTREME") expansion += currentSpreadBps * 0.6;
  if (vol.burstDetected) expansion += currentSpreadBps * 0.4;

  // Taker aggression widens spreads
  if (flow.takerRatio > 0.7) expansion += currentSpreadBps * 0.2;

  // High velocity widens spreads
  if (velocity > 50) expansion += currentSpreadBps * 0.15;

  const probability = Math.min(1, expansion / (currentSpreadBps + 0.01));
  direction = expansion > 0 ? "WIDEN" : "NARROW";

  return {
    expectedBps: Math.round((currentSpreadBps + expansion) * 100) / 100,
    probability: Math.round(Math.min(1, probability) * 100) / 100,
    direction,
  };
}
