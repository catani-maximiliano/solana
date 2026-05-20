import { ConfidenceBreakdown } from "./types";
import { flowEngine } from "../flow/flowEngine";
import { orderbookState } from "../orderbook/orderbookState";
import { persistenceTracker } from "../microstructure/persistenceTracker";
import { volatilityWindow } from "../microstructure/volatilityWindow";

export function computeConfidence(
  pair: string,
  pool: string,
): ConfidenceBreakdown {
  // Flow confidence: balanced flow = higher confidence
  const flow = flowEngine.getPoolFlow(pool);
  const flowScore = flow ? 1 - Math.abs(flow.buyRatio - 0.5) * 2 : 0.5;

  // Orderbook confidence: balanced = higher
  const ob = orderbookState.get(pair);
  const obScore = ob ? 1 - Math.abs(ob.imbalance - 0.5) * 2 : 0.5;

  // Persistence confidence
  const persistScore = persistenceTracker.getScore(pair);

  // Volatility confidence: low vol = higher confidence
  const vol = volatilityWindow.getSnapshot(pair);
  const volScore = vol.regime === "LOW" ? 0.9 : vol.regime === "MEDIUM" ? 0.6 : vol.regime === "HIGH" ? 0.3 : 0.1;

  // Overall
  const overall = flowScore * 0.25 + obScore * 0.25 + persistScore * 0.25 + volScore * 0.25;

  return {
    flow: Math.round(flowScore * 100) / 100,
    orderbook: Math.round(obScore * 100) / 100,
    persistence: Math.round(persistScore * 100) / 100,
    volatility: Math.round(volScore * 100) / 100,
    whalePresence: 0.5,
    overall: Math.round(overall * 100) / 100,
  };
}
