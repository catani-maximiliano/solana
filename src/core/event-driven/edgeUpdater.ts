import { NormalizedRealtimeEvent } from "../../streams/registry/eventTypes";
import { priceGraph } from "../../graph";
import { marketState } from "../../market/state-cache";
import { logDebug, logWarning } from "../../logger";

const EDGE_STALE_MS = 30_000;

/**
 * Update the graph for a single pool based on a swap event.
 * Works for any DEX (Whirlpool, Raydium, etc.).
 */
export function updateEdgeFromSwap(event: NormalizedRealtimeEvent): boolean {
  if (!event.pool || !event.tokenIn || !event.tokenOut) {
    logDebug(`[EDGE] missing required fields: pool=${event.pool} tokenIn=${event.tokenIn} tokenOut=${event.tokenOut}`);
    return false;
  }

  // Compute forward price from swap amounts
  const forwardPrice = event.amountIn > 0 ? event.amountOut / event.amountIn : 0;
  if (forwardPrice <= 0 || !isFinite(forwardPrice)) {
    logDebug(`[EDGE] invalid price from swap: amountIn=${event.amountIn} amountOut=${event.amountOut}`);
    return false;
  }

  // Determine decimals based on DEX
  const dex = event.dex || "unknown";
  let decimalsA = 9, decimalsB = 6;
  // In future, look up decimals from a registry based on token mints

  if (!event.pool) return false;

  // Build a minimal snapshot from event data
  const snapshot: any = {
    poolAddress: event.pool,
    dex,
    mintA: event.tokenIn,
    mintB: event.tokenOut,
    decimalsA,
    decimalsB,
    sqrtPriceX64: "0",
    liquidity: event.liquidity || "0",
    tick: event.tick || 0,
    fee: 0,
    slot: event.slot,
    timestamp: event.receivedAt,
    dataQuality: "VALID",
    source: "ON_CHAIN_VALIDATED",
  };

  // Update via existing graph pipeline
  try {
    priceGraph.updateFromPool(snapshot);
    logDebug(`[EDGE] ✅ ${dex} ${event.pool.substring(0, 8)}... price=${forwardPrice.toFixed(6)} slot=${event.slot}`);
    return true;
  } catch (err) {
    logWarning(`[EDGE] update failed: ${dex} ${event.pool.substring(0, 8)}... — ${err instanceof Error ? err.message : String(err)}`);
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
