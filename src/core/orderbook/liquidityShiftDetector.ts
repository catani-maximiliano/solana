import { LiquidityShift } from "./types";
import { orderbookState } from "./orderbookState";
import { logDebug } from "../../logger";

interface PrevLiquidity {
  bidDepth: number;
  askDepth: number;
}

const LIQUIDITY_WALL_THRESHOLD = 0.3; // 30% of depth = wall
const SWEEP_LIKELIHOOD_BOOST = 0.15;

export class LiquidityShiftDetector {
  private prev = new Map<string, PrevLiquidity>();

  detect(market: string): LiquidityShift {
    const snap = orderbookState.get(market);
    if (!snap) return { market, bidLiquidityChange: 0, askLiquidityChange: 0, netDirection: "NONE", wallDetected: false, sweepLikelihood: 0 };

    const prev = this.prev.get(market);
    let bidChange = 0;
    let askChange = 0;
    let netDirection: "BUY" | "SELL" | "NONE" = "NONE";
    let sweepLikelihood = 0;

    if (prev) {
      bidChange = (snap.bidDepth - prev.bidDepth) / Math.max(1, prev.bidDepth);
      askChange = (snap.askDepth - prev.askDepth) / Math.max(1, prev.askDepth);

      if (bidChange < -0.2 && askChange > 0.1) { netDirection = "SELL"; sweepLikelihood += SWEEP_LIKELIHOOD_BOOST; }
      if (askChange < -0.2 && bidChange > 0.1) { netDirection = "BUY"; sweepLikelihood += SWEEP_LIKELIHOOD_BOOST; }
    }

    this.prev.set(market, { bidDepth: snap.bidDepth, askDepth: snap.askDepth });

    // Liquidity wall detection
    const totalDepth = snap.bidDepth + snap.askDepth;
    const wallDetected = totalDepth > 0 && (snap.bidDepth / totalDepth > LIQUIDITY_WALL_THRESHOLD || snap.askDepth / totalDepth > LIQUIDITY_WALL_THRESHOLD);

    if (netDirection !== "NONE" || wallDetected) {
      logDebug(`[LIQUIDITY] ${market} bidΔ=${(bidChange * 100).toFixed(0)}% askΔ=${(askChange * 100).toFixed(0)}% net=${netDirection} wall=${wallDetected}`);
    }

    return {
      market,
      bidLiquidityChange: Math.round(bidChange * 100) / 100,
      askLiquidityChange: Math.round(askChange * 100) / 100,
      netDirection,
      wallDetected,
      sweepLikelihood: Math.round(Math.min(1, sweepLikelihood) * 100) / 100,
    };
  }

  reset(): void { this.prev.clear(); }
}

export const liquidityShiftDetector = new LiquidityShiftDetector();
