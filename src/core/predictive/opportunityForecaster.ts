import { OpportunityForecast } from "./types";
import { persistenceTracker } from "../microstructure/persistenceTracker";
import { velocityTracker } from "../flow/velocityTracker";
import { predictSpreadPersistence } from "./spreadPersistence";
import { logDebug } from "../../logger";

/**
 * Forecast whether an opportunity will remain profitable.
 */
export function forecastOpportunity(
  pair: string,
  pool: string,
  currentSpread: number,
): OpportunityForecast {
  const persistPrediction = predictSpreadPersistence(pair, currentSpread);
  const velocity = velocityTracker.getVelocity(pool);

  // Predicted spread: current spread decays by velocity
  const decayFactor = Math.max(0, 1 - Math.abs(velocity) * 0.01);
  const predictedSpread = currentSpread * decayFactor;

  // Survival probability
  const survivalProbability = persistPrediction.persistenceProbability;

  // Window: how long the opportunity is expected to last
  const windowMs = persistPrediction.expectedSurvivalMs;

  const confidence = persistPrediction.confidence;

  return {
    pair,
    currentSpread: Math.round(currentSpread * 100) / 100,
    predictedSpread: Math.round(predictedSpread * 100) / 100,
    survivalProbability: Math.round(survivalProbability * 100) / 100,
    windowMs,
    confidence: Math.round(confidence * 100) / 100,
  };
}

export function logForecast(forecast: OpportunityForecast): void {
  logDebug(`[PREDICT] ${forecast.pair} edge persistence=${(forecast.survivalProbability * 100).toFixed(0)}% expected survival=${forecast.windowMs}ms spread ${forecast.currentSpread}→${forecast.predictedSpread}`);
}
