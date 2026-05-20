import { orderbookState } from "../orderbook/orderbookState";
import { makerTakerAnalyzer } from "../orderbook/makerTakerAnalyzer";
import { volatilityWindow } from "../microstructure/volatilityWindow";

export function estimateFillProbability(
  market: string,
  liquidity: number,
  spreadBps: number,
): number {
  // Liquidity depth score
  const liqScore = Math.min(1, liquidity / 5_000_000);

  // Orderbook imbalance: higher imbalance = lower fill prob (competing for same side)
  let imbalancePenalty = 0;
  const ob = orderbookState.get(market);
  if (ob) {
    const imb = ob.imbalance;
    if (imb > 0.7 || imb < 0.3) imbalancePenalty = 0.2;
  }

  // Taker pressure: higher taker ratio = more competition
  const flow = makerTakerAnalyzer.analyze(market);
  const takerPenalty = flow.takerRatio * 0.15;

  // Volatility penalty
  const vol = volatilityWindow.getSnapshot(market);
  const volPenalty = vol.regime === "HIGH" ? 0.2 : vol.regime === "EXTREME" ? 0.35 : 0;

  // Competition penalty from spread size
  const compPenalty = Math.min(0.3, spreadBps / 100 * 0.3);

  const prob = Math.min(1, Math.max(0,
    liqScore * 0.35 +
    (1 - imbalancePenalty) * 0.2 +
    (1 - takerPenalty) * 0.2 +
    (1 - volPenalty) * 0.15 +
    (1 - compPenalty) * 0.1
  ));

  return Math.round(prob * 100) / 100;
}
