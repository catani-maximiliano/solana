import { sameDexGuard } from "./sameDexGuard";
import { confidenceSanitizer } from "./confidenceSanitizer";
import { poolFreshnessTracker } from "./poolFreshnessTracker";
import { poolHealthTracker } from "../market/pool-health";
import { config } from "../../config";
import { logInfo } from "../../logger";

export interface PoolLeg {
  poolAddress: string;
  dex: string;
  price: number;
  liquidity: number;
  ageMs: number;
  slotDelta: number;
  slot: number;
}

export interface SpreadValidation {
  valid: boolean;
  reason?: string;
}

export class SpreadIntegrityValidator {
  validate(buy: PoolLeg, sell: PoolLeg): SpreadValidation {
    // 1. Both pools must be tracked and fresh
    const buyFresh = poolFreshnessTracker.getFreshness(buy.poolAddress);
    const sellFresh = poolFreshnessTracker.getFreshness(sell.poolAddress);
    if (!buyFresh) return { valid: false, reason: `buy pool ${buy.poolAddress.substring(0, 8)}... not tracked` };
    if (!sellFresh) return { valid: false, reason: `sell pool ${sell.poolAddress.substring(0, 8)}... not tracked` };

    // 2. Age check (per-DEX)
    const DEX_MAX_AGE: Record<string, number> = { Whirlpool: 5000, "Raydium CLMM": 3000, Raydium: 3000, Meteora: 3000 };
    const buyMaxAge = DEX_MAX_AGE[buy.dex] ?? 5000;
    const sellMaxAge = DEX_MAX_AGE[sell.dex] ?? 5000;
    if (buy.ageMs > buyMaxAge) return { valid: false, reason: `buy leg stale age=${(buy.ageMs / 1000).toFixed(1)}s > ${buyMaxAge}ms (${buy.dex})` };
    if (sell.ageMs > sellMaxAge) return { valid: false, reason: `sell leg stale age=${(sell.ageMs / 1000).toFixed(1)}s > ${sellMaxAge}ms (${sell.dex})` };

    // 3. Slot consistency
    if (buy.slotDelta > 8) return { valid: false, reason: `buy leg slotΔ=${buy.slotDelta} > 8` };
    if (sell.slotDelta > 8) return { valid: false, reason: `sell leg slotΔ=${sell.slotDelta} > 8` };

    // 4. Different DEXes
    const dexCheck = sameDexGuard.reject(buy.dex, sell.dex, buy.poolAddress, sell.poolAddress, `${buy.dex}/${sell.dex}`);
    if (!dexCheck.allowed) return { valid: false, reason: dexCheck.reason };

    // 5. Nonzero liquidity
    if (buy.liquidity <= 0) return { valid: false, reason: `buy leg liq=0 ${buy.poolAddress.substring(0, 8)}...` };
    if (sell.liquidity <= 0) return { valid: false, reason: `sell leg liq=0 ${sell.poolAddress.substring(0, 8)}...` };

    // 6. Valid prices
    if (buy.price <= 0) return { valid: false, reason: `buy leg price<=0 ${buy.poolAddress.substring(0, 8)}...` };
    if (sell.price <= 0) return { valid: false, reason: `sell leg price<=0 ${sell.poolAddress.substring(0, 8)}...` };

    // 7. Confidence sanitizer for both legs
    const pairCheck = confidenceSanitizer.sanitizePair(
      { address: buy.poolAddress, dex: buy.dex, age: buy.ageMs, slotDelta: buy.slotDelta },
      { address: sell.poolAddress, dex: sell.dex, age: sell.ageMs, slotDelta: sell.slotDelta },
    );
    if (!pairCheck.valid) return { valid: false, reason: pairCheck.reasons.join("; ") };

    // 8. Pool health gate (auto-disable check)
    if (config.enablePoolHealthSystem) {
      if (poolHealthTracker.isDisabled(buy.poolAddress)) {
        return { valid: false, reason: `buy pool disabled: ${poolHealthTracker.getDisableReason(buy.poolAddress)}` };
      }
      if (poolHealthTracker.isDisabled(sell.poolAddress)) {
        return { valid: false, reason: `sell pool disabled: ${poolHealthTracker.getDisableReason(sell.poolAddress)}` };
      }
    }

    return { valid: true };
  }
}

export const spreadIntegrityValidator = new SpreadIntegrityValidator();
