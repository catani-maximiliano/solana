import { ImbalanceSignal } from "./types";
import { orderbookState } from "./orderbookState";
import { logDebug } from "../../logger";

const IMBALANCE_HISTORY_LEN = 20;

export class ImbalanceDetector {
  private history = new Map<string, number[]>();

  detect(market: string): ImbalanceSignal {
    const imbalance = orderbookState.getImbalance(market);
    const prev = this.history.get(market) || [];
    prev.push(imbalance);
    if (prev.length > IMBALANCE_HISTORY_LEN) prev.shift();
    this.history.set(market, prev);

    const sustained = prev.length >= 5 && prev.slice(-5).every(v => v > 0.6 || v < 0.4);
    let directionalBias: "BUY" | "SELL" | "NEUTRAL" = "NEUTRAL";
    if (imbalance > 0.6) directionalBias = "BUY";
    else if (imbalance < 0.4) directionalBias = "SELL";

    const magnitude = Math.abs(imbalance - 0.5) * 2;

    if (directionalBias !== "NEUTRAL") {
      logDebug(`[IMBALANCE] ${market} bidPressure=${(imbalance * 100).toFixed(0)}% dir=${directionalBias} sustained=${sustained}`);
    }

    return {
      market,
      bidPressure: Math.round(imbalance * 10000) / 100,
      directionalBias,
      magnitude: Math.round(magnitude * 100) / 100,
      sustained,
    };
  }

  reset(): void { this.history.clear(); }
}

export const imbalanceDetector = new ImbalanceDetector();
