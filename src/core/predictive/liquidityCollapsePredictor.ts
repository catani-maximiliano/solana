import { LiquidityCollapseSignal } from "./types";
import { liquidityShiftDetector } from "../orderbook/liquidityShiftDetector";
import { volatilityWindow } from "../microstructure/volatilityWindow";

export function predictLiquidityCollapse(market: string): LiquidityCollapseSignal {
  const shift = liquidityShiftDetector.detect(market);
  const vol = volatilityWindow.getSnapshot(market);

  let probability = 0;
  let side: "BID" | "ASK" | "BOTH" = "BOTH";

  // Liquidity drain on both sides
  if (shift.bidLiquidityChange < -0.2 && shift.askLiquidityChange < -0.2) {
    probability += 0.5;
    side = "BOTH";
  } else if (shift.bidLiquidityChange < -0.3) {
    probability += 0.3;
    side = "BID";
  } else if (shift.askLiquidityChange < -0.3) {
    probability += 0.3;
    side = "ASK";
  }

  // Volatility burst increases collapse risk
  if (vol.burstDetected) probability += 0.3;
  if (vol.regime === "EXTREME") probability += 0.2;

  probability = Math.min(1, probability);

  let severity: "LOW" | "MEDIUM" | "HIGH" = "LOW";
  if (probability > 0.6) severity = "HIGH";
  else if (probability > 0.3) severity = "MEDIUM";

  return {
    probability: Math.round(probability * 100) / 100,
    side,
    severity,
  };
}
