import { DecodedSwapPayload, NormalizedSwapEvent } from "./types";
import { sqrtPriceX64ToPrice } from "../../math";
import { logDebug } from "../../logger";

/**
 * Normalize a raw stream payload into a NormalizedSwapEvent.
 * Handles multiple field naming conventions from Orca stream payloads.
 */
export function normalizeSwapEvent(
  raw: DecodedSwapPayload,
  slot: number,
  topic: string,
): NormalizedSwapEvent | null {
  try {
    const now = Date.now();
    const blockTimeMs = raw.blockTime ? raw.blockTime * 1000 : now;
    const sqrtPrice = raw.sqrtPrice || raw.sqrtPriceX64 || "0";
    const tick = raw.tick ?? raw.tickCurrentIndex ?? 0;
    const liq = raw.liquidity || "0";

    const tokenIn = raw.tokenIn || raw.mintA || raw.tokenA || "";
    const tokenOut = raw.tokenOut || raw.mintB || raw.tokenB || "";
    const amountIn = Number(raw.amountIn ?? raw.inputAmount ?? 0);
    const amountOut = Number(raw.amountOut ?? raw.outputAmount ?? 0);
    const pool = raw.pool || "";

    if (!tokenIn || !tokenOut || !pool || amountIn <= 0) {
      return null;
    }

    // Compute approximate price from sqrtPriceX64
    let priceBefore = 0;
    let priceAfter = 0;
    if (sqrtPrice !== "0") {
      try {
        priceBefore = sqrtPriceX64ToPrice(BigInt(sqrtPrice), 9, 6);
      } catch {
        priceBefore = 0;
      }
      // Estimate price after: for a swap of amountIn tokenIn → tokenOut
      if (amountOut > 0 && amountIn > 0) {
        priceAfter = amountOut / amountIn;
      } else {
        priceAfter = priceBefore;
      }
    }

    return {
      dex: "Whirlpool",
      streamTopic: topic,
      slot,
      signature: raw.signature || "",
      pool,
      tokenIn,
      tokenOut,
      amountIn,
      amountOut,
      priceBefore,
      priceAfter,
      tick,
      liquidity: liq,
      receivedAt: now,
      blockTime: blockTimeMs,
      latencyMs: Math.max(0, now - blockTimeMs),
    };
  } catch (err) {
    logDebug(`[NLN-NORMALIZER] error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
