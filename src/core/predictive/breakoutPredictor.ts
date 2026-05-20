import { BreakoutSignal } from "./types";
import { imbalanceDetector } from "../orderbook/imbalanceDetector";
import { makerTakerAnalyzer } from "../orderbook/makerTakerAnalyzer";
import { velocityTracker } from "../flow/velocityTracker";
import { orderbookState } from "../orderbook/orderbookState";

export function predictBreakout(market: string, pool: string): BreakoutSignal {
  const imbalance = imbalanceDetector.detect(market);
  const flow = makerTakerAnalyzer.analyze(market);
  const accel = velocityTracker.getAcceleration(pool);
  const ob = orderbookState.get(market);

  let probability = 0;
  let direction: "UP" | "DOWN" | "NEUTRAL" = "NEUTRAL";
  const triggers: string[] = [];

  // Sustained imbalance + taker aggression = breakout
  if (imbalance.sustained && flow.aggressiveBuyPct > 0.6) {
    probability += 0.4;
    direction = "UP";
    triggers.push("sustained_imbalance+taker_buy");
  }
  if (imbalance.sustained && flow.aggressiveSellPct > 0.6) {
    probability += 0.4;
    direction = "DOWN";
    triggers.push("sustained_imbalance+taker_sell");
  }

  // Velocity acceleration
  if (accel > 0.5) { probability += 0.2; triggers.push("velocity_acceleration"); }
  if (accel < -0.5) { probability += 0.2; triggers.push("velocity_deceleration"); }

  // Liquidity wall presence
  if (ob) {
    const bidWall = ob.bidDepth > ob.askDepth * 2;
    const askWall = ob.askDepth > ob.bidDepth * 2;
    if (askWall && direction === "UP") probability += 0.15;
    if (bidWall && direction === "DOWN") probability += 0.15;
  }

  probability = Math.min(1, probability);

  return {
    probability: Math.round(probability * 100),
    direction,
    trigger: triggers.join("+") || "none",
    confidence: Math.round(probability * 100) / 100,
  };
}
