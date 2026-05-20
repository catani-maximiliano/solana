import { ToxicFlowSignal } from "./types";
import { velocityTracker } from "./velocityTracker";

interface PoolToxicity {
  inOutCount: number;
  lastInTime: number;
  volatilityHistory: number[];
}

const RAPID_INOUT_MS = 2000;
const BURST_THRESHOLD = 5;

export class ToxicFlowDetector {
  private poolStates = new Map<string, PoolToxicity>();

  detect(pool: string): ToxicFlowSignal {
    const state = this.poolStates.get(pool) || { inOutCount: 0, lastInTime: 0, volatilityHistory: [] };
    const now = Date.now();

    const freq = velocityTracker.getFrequency(pool);
    const spike = velocityTracker.hasVolumeSpike(pool);

    state.volatilityHistory.push(freq);
    if (state.volatilityHistory.length > 10) state.volatilityHistory.shift();
    const avgFreq = state.volatilityHistory.reduce((a, b) => a + b, 0) / state.volatilityHistory.length;

    const rapidInOut = state.inOutCount > 3 && (now - state.lastInTime) < RAPID_INOUT_MS;
    const burstVolatility = freq > avgFreq * BURST_THRESHOLD && avgFreq > 0;
    const sandwichLikelihood = rapidInOut ? 0.7 : burstVolatility ? 0.4 : 0.1;

    let toxicity: "SAFE" | "RISKY" | "TOXIC" = "SAFE";
    if (sandwichLikelihood > 0.6 || (rapidInOut && burstVolatility)) toxicity = "TOXIC";
    else if (sandwichLikelihood > 0.3 || burstVolatility) toxicity = "RISKY";

    const score = Math.round(sandwichLikelihood * 100);
    if (toxicity !== "SAFE") {
      state.inOutCount++;
      state.lastInTime = now;
    }

    return { pool, toxicity, sandwichLikelihood, rapidInOut, burstVolatility, score };
  }

  reset(): void { this.poolStates.clear(); }
}

export const toxicFlowDetector = new ToxicFlowDetector();
