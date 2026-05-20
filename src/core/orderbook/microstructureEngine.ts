import { MicrostructureSignal } from "./types";
import { orderbookState } from "./orderbookState";
import { imbalanceDetector } from "./imbalanceDetector";
import { liquidityShiftDetector } from "./liquidityShiftDetector";
import { makerTakerAnalyzer } from "./makerTakerAnalyzer";
import { logInfo, logDebug } from "../../logger";

/**
 * Aggregate microstructure signals for a market.
 */
export function analyzeMicrostructure(market: string): MicrostructureSignal {
  const imbalance = imbalanceDetector.detect(market);
  const liquidity = liquidityShiftDetector.detect(market);
  const flow = makerTakerAnalyzer.analyze(market);

  // Spoof-like behavior: imbalance shifts without taker confirmation
  const spoofLike = imbalance.directionalBias !== "NEUTRAL" && flow.takerRatio < 0.3 && liquidity.netDirection === "NONE";

  // Liquidity pull: both sides dropping (liquidity leaving)
  const liquidityPull = liquidity.bidLiquidityChange < -0.1 && liquidity.askLiquidityChange < -0.1;

  // Sweep probability: aggressive imbalance + taker flow
  const sweepProb = Math.min(1, imbalance.magnitude * (1 - flow.takerRatio) + liquidity.sweepLikelihood);

  // Breakout probability: sustained imbalance + taker aggression
  const breakoutProb = imbalance.sustained ? Math.min(1, imbalance.magnitude * 0.7 + flow.takerRatio * 0.5) : 0.1;

  // Mean reversion: extended imbalance without price movement
  const meanReversionProb = imbalance.sustained && !liquidity.wallDetected ? 0.6 : 0.2;

  const signalStrength = Math.max(sweepProb, breakoutProb, meanReversionProb);

  if (signalStrength > 0.6) {
    logInfo(`[MICROSTRUCTURE] ${market} sweep=${(sweepProb * 100).toFixed(0)}% breakout=${(breakoutProb * 100).toFixed(0)}% meanRev=${(meanReversionProb * 100).toFixed(0)}% spoof=${spoofLike}`);
  }

  return {
    market,
    liquidityPull,
    spoofLike,
    sweepProbability: Math.round(sweepProb * 100) / 100,
    breakoutProb: Math.round(breakoutProb * 100) / 100,
    meanReversionProb: Math.round(meanReversionProb * 100) / 100,
    signalStrength: Math.round(signalStrength * 100) / 100,
  };
}
