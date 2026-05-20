import { SignalWeights, RegimeType, FeatureImportance } from "./types";

const DEFAULT_WEIGHTS: SignalWeights = {
  flow: 1.0, toxicity: 1.0, timing: 1.0, alpha: 1.0,
  competition: 1.0, microstructure: 1.0, spreadPersistence: 1.0, orderbook: 1.0,
};

export function computeAdaptiveWeights(regime: RegimeType, importance: FeatureImportance[]): SignalWeights {
  const w = { ...DEFAULT_WEIGHTS };

  // Adjust based on regime
  if (regime.name === "HIGH_VOL") {
    w.timing = 1.8;
    w.toxicity = 1.5;
    w.flow = 0.7;
  } else if (regime.name === "LOW_VOL") {
    w.microstructure = 1.6;
    w.spreadPersistence = 1.4;
  } else if (regime.name === "MEV_SWARM") {
    w.competition = 2.0;
    w.toxicity = 1.8;
    w.timing = 0.6;
  } else if (regime.name === "TOXIC") {
    w.toxicity = 2.0;
    w.competition = 1.5;
    w.flow = 0.5;
  }

  // Adjust based on feature importance evidence
  for (const fi of importance) {
    if (fi.direction === "NEGATIVE" && fi.confidence > 0.5) {
      // Reduce weight for negative contributors
      const signalKey = fi.signal as keyof SignalWeights;
      if (signalKey in w) {
        w[signalKey] = Math.max(0.1, w[signalKey] * 0.7);
      }
    }
    if (fi.direction === "POSITIVE" && fi.confidence > 0.7) {
      const signalKey = fi.signal as keyof SignalWeights;
      if (signalKey in w) {
        w[signalKey] = Math.min(3.0, w[signalKey] * 1.2);
      }
    }
  }

  return w;
}
