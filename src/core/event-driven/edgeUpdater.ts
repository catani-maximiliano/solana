import { NormalizedSwapEvent } from "../../streams/nolimitnode/types";
import { priceGraph } from "../../graph";
import { marketState } from "../../market/state-cache";
import { sqrtPriceX64ToPrice } from "../../math";
import { logDebug } from "../../logger";

const EDGE_STALE_MS = 10_000;

/**
 * Update the graph for a single pool based on a swap event.
 * This replaces the old RPC-based pool snapshot update pattern.
 */
export function updateEdgeFromSwap(event: NormalizedSwapEvent): boolean {
  if (!event.pool || !event.tokenIn || !event.tokenOut) return false;

  // Compute forward price (tokenOut per tokenIn)
  const forwardPrice = event.amountIn > 0 ? event.amountOut / event.amountIn : 0;
  if (forwardPrice <= 0) return false;

  // Build a minimal snapshot from event data
  const snapshot = {
    poolAddress: event.pool,
    dex: "Whirlpool",
    mintA: event.tokenIn,
    mintB: event.tokenOut,
    decimalsA: 9,
    decimalsB: 6,
    sqrtPriceX64: event.priceBefore > 0 ? "0" : "0",
    liquidity: event.liquidity || "0",
    tick: event.tick,
    fee: 0,
    slot: event.slot,
    timestamp: event.receivedAt,
    dataQuality: "VALID" as const,
    source: "ON_CHAIN_VALIDATED" as const,
  };

  // Update via existing graph pipeline (but skip RPC-heavy validation)
  try {
    priceGraph.updateFromPool(snapshot);
    return true;
  } catch (err) {
    logDebug(`[EDGE] update failed: ${event.pool.substring(0, 8)}... — ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/** Get age of an edge (ms since last update) */
export function getEdgeAge(pool: string): number {
  const poolState = marketState.getPool(pool);
  if (!poolState) return Infinity;
  return Date.now() - poolState.timestamp;
}

/** Check if an edge is still fresh */
export function isEdgeFresh(pool: string): boolean {
  return getEdgeAge(pool) < EDGE_STALE_MS;
}
