import { OrderbookSnapshot } from "./types";
import { logDebug } from "../../logger";

export class OrderbookState {
  private snapshots = new Map<string, OrderbookSnapshot>();

  update(snapshot: OrderbookSnapshot): void {
    const prev = this.snapshots.get(snapshot.market);
    this.snapshots.set(snapshot.market, snapshot);
  }

  get(market: string): OrderbookSnapshot | undefined {
    return this.snapshots.get(market);
  }

  getImbalance(market: string): number {
    const s = this.snapshots.get(market);
    if (!s || s.bidDepth + s.askDepth === 0) return 0.5;
    return s.bidDepth / (s.bidDepth + s.askDepth);
  }

  getSpread(market: string): number {
    const s = this.snapshots.get(market);
    if (!s || s.bestAsk <= 0) return 0;
    return ((s.bestAsk - s.bestBid) / s.bestAsk) * 10000;
  }

  reset(): void { this.snapshots.clear(); }
}

export const orderbookState = new OrderbookState();
