import { SweepSignal } from "./types";
import { imbalanceDetector } from "../orderbook/imbalanceDetector";
import { liquidityShiftDetector } from "../orderbook/liquidityShiftDetector";
import { makerTakerAnalyzer } from "../orderbook/makerTakerAnalyzer";
import { velocityTracker } from "../flow/velocityTracker";

export function predictSweep(market: string, pool: string): SweepSignal {
  const imbalance = imbalanceDetector.detect(market);
  const liquidity = liquidityShiftDetector.detect(market);
  const flow = makerTakerAnalyzer.analyze(market);
  const velocity = velocityTracker.getVelocity(pool);

  let probability = 0;
  let side: "BUY" | "SELL" = "BUY";

  // Imbalance + taker aggression = sweep setup
  if (imbalance.directionalBias === "BUY" && flow.aggressiveBuyPct > 0.6) {
    probability += 0.4;
    side = "BUY";
  }
  if (imbalance.directionalBias === "SELL" && flow.aggressiveSellPct > 0.6) {
    probability += 0.4;
    side = "SELL";
  }

  // Liquidity shift confirming sweep
  if (liquidity.netDirection === "SELL" && side === "BUY") probability += 0.2;
  if (liquidity.netDirection === "BUY" && side === "SELL") probability += 0.2;

  // Velocity acceleration = imminent
  if (velocityTracker.getAcceleration(pool) > 0.5) probability += 0.15;

  probability = Math.min(1, probability);

  // Estimated size proportional to depth
  const estimatedSize = Math.round(probability * 10000);

  return {
    probability: Math.round(probability * 100) / 100,
    side,
    estimatedSize,
  };
}
