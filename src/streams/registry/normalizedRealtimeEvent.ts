import { NormalizedRealtimeEvent, TopicConfig } from "./eventTypes";
import { sqrtPriceX64ToPrice } from "../../math";
import { logDebug } from "../../logger";

/**
 * Auto-detect and normalize fields from any NoLimitNode event payload.
 * Handles multiple naming conventions across different protocols.
 */
export function normalizeRealtimeEvent(
  raw: Record<string, any>,
  slot: number,
  topicConfig: TopicConfig,
): NormalizedRealtimeEvent | null {
  try {
    const now = Date.now();

    // Auto-detect fields by common naming conventions
    const signature = raw.signature || raw.txId || raw.txSignature || "";
    const pool = raw.pool || raw.poolAddress || raw.market || "";
    const tokenIn = raw.tokenIn || raw.tokenA || raw.mintA || raw.inputMint || raw.tokenMintA || "";
    const tokenOut = raw.tokenOut || raw.tokenB || raw.mintB || raw.outputMint || raw.tokenMintB || "";
    const amountIn = Number(raw.amountIn ?? raw.inputAmount ?? raw.inAmount ?? 0);
    const amountOut = Number(raw.amountOut ?? raw.outputAmount ?? raw.outAmount ?? 0);
    const tick = raw.tick ?? raw.tickCurrentIndex ?? 0;
    const liquidity = raw.liquidity || raw.poolLiquidity || "0";
    const blockTime = raw.blockTime ? raw.blockTime * 1000 : now;
    const sqrtPrice = raw.sqrtPrice || raw.sqrtPriceX64 || "0";

    if (!pool && !tokenIn && !tokenOut) return null;

    // Compute price from sqrtPrice if available
    let price = 0;
    if (sqrtPrice !== "0") {
      try { price = sqrtPriceX64ToPrice(BigInt(sqrtPrice), 9, 6); } catch {}
    }
    if (price <= 0 && amountOut > 0 && amountIn > 0) {
      price = amountOut / amountIn;
    }

    return {
      dex: topicConfig.dex,
      topic: topicConfig.topic,
      eventKind: topicConfig.eventType,
      slot,
      signature,
      pool,
      tokenIn,
      tokenOut,
      amountIn,
      amountOut,
      price,
      tick,
      liquidity,
      receivedAt: now,
      blockTime,
      latencyMs: Math.max(0, now - blockTime),
      raw,
    };
  } catch (err) {
    logDebug(`[NLN-NORMALIZER] error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
