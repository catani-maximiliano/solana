import { NormalizedRealtimeEvent } from "../../streams/registry/eventTypes";
import { OrderbookSnapshot } from "./types";
import { orderbookState } from "./orderbookState";
import { imbalanceDetector } from "./imbalanceDetector";
import { liquidityShiftDetector } from "./liquidityShiftDetector";
import { makerTakerAnalyzer } from "./makerTakerAnalyzer";
import { analyzeMicrostructure } from "./microstructureEngine";
import { logInfo, logDebug } from "../../logger";

export class OrderbookEngine {
  /** Process a market event from NLN stream */
  processEvent(event: NormalizedRealtimeEvent): void {
    const market = event.pool;
    if (!market) return;

    // Build/update orderbook snapshot from event data
    const prev = orderbookState.get(market);
    const snapshot: OrderbookSnapshot = {
      market,
      bestBid: event.price * 0.999, // synthetic bid
      bestAsk: event.price * 1.001, // synthetic ask
      spread: 0,
      bidDepth: Number(event.liquidity || 0),
      askDepth: Number(event.liquidity || 0),
      imbalance: 0.5,
      lastSlot: event.slot,
      updatedAt: Date.now(),
    };

    if (prev) {
      snapshot.bestBid = prev.bestBid;
      snapshot.bestAsk = prev.bestAsk;
      snapshot.bidDepth = prev.bidDepth;
      snapshot.askDepth = prev.askDepth;
    }

    orderbookState.update(snapshot);

    // Process all analysis layers
    imbalanceDetector.detect(market);
    liquidityShiftDetector.detect(market);
    makerTakerAnalyzer.recordFill(market, true, event.amountIn < event.amountOut, Math.max(event.amountIn, event.amountOut));
  }

  /** Full microstructure analysis */
  analyze(market: string) {
    return analyzeMicrostructure(market);
  }

  /** Get current orderbook state */
  getState(market: string) {
    return orderbookState.get(market);
  }

  reset(): void {
    orderbookState.reset();
    imbalanceDetector.reset();
    liquidityShiftDetector.reset();
    makerTakerAnalyzer.reset();
  }
}

export const orderbookEngine = new OrderbookEngine();
