import { flowEngine } from "./flowEngine";
import { logInfo, logDebug } from "../../logger";

const PRESSURE_THRESHOLD = 0.6;
const EXTREME_THRESHOLD = 0.8;

export class PressureEngine {
  private lastPressure = new Map<string, string>();

  /** Get buy pressure for a pool (0-1, >0.5 = buy dominated) */
  getPressure(pool: string): number {
    const flow = flowEngine.getPoolFlow(pool);
    if (!flow || flow.tradeCount < 3) return 0.5;
    return flow.buyRatio;
  }

  /** Detect significant pressure shifts */
  detectShift(pool: string): "BUY" | "SELL" | "NEUTRAL" | "BUY_SURGE" | "SELL_SURGE" {
    const pressure = this.getPressure(pool);
    const last = this.lastPressure.get(pool) || "NEUTRAL";

    let signal: string;
    if (pressure > EXTREME_THRESHOLD) signal = "BUY_SURGE";
    else if (pressure < 1 - EXTREME_THRESHOLD) signal = "SELL_SURGE";
    else if (pressure > PRESSURE_THRESHOLD) signal = "BUY";
    else if (pressure < 1 - PRESSURE_THRESHOLD) signal = "SELL";
    else signal = "NEUTRAL";

    if (signal !== last) {
      logDebug(`[FLOW] ${pool} pressure: ${last} → ${signal} (buyRatio=${pressure.toFixed(2)})`);
      this.lastPressure.set(pool, signal);
    }

    return signal as any;
  }

  reset(): void { this.lastPressure.clear(); }
}

export const pressureEngine = new PressureEngine();
