import { UnifiedSignal } from "./types";
import { predictBreakout } from "./breakoutPredictor";
import { predictLiquidityCollapse } from "./liquidityCollapsePredictor";
import { predictSweep } from "./sweepPredictor";
import { predictMomentum } from "./momentumContinuation";
import { forecastVolatility } from "./volatilityForecast";
import { computeAlphaScore } from "./alphaScore";
import { logInfo } from "../../logger";

/**
 * Fuse all predictive signals into a single UnifiedSignal.
 */
export function fuseSignals(market: string, pool: string): UnifiedSignal {
  const breakout = predictBreakout(market, pool);
  const collapse = predictLiquidityCollapse(market);
  const sweep = predictSweep(market, pool);
  const momentum = predictMomentum(market, pool);
  const volatility = forecastVolatility(market, pool);
  const alpha = computeAlphaScore(breakout, collapse, sweep, momentum, volatility);

  return { pair: market, alpha, breakout, collapse, sweep, momentum, volatility };
}

export function logUnifiedSignal(signal: UnifiedSignal): void {
  logInfo(`[PREDICT] ${signal.pair} breakout=${signal.breakout.probability}% collapse=${(signal.collapse.probability * 100).toFixed(0)}% sweep=${(signal.sweep.probability * 100).toFixed(0)}% momentum=${signal.momentum.direction} alpha=${signal.alpha.score}`);
}
