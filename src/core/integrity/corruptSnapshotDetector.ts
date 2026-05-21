import { CorruptSnapshotReport } from "./types";
import { logWarning, logDebug } from "../../logger";

const MAX_REASONABLE_PRICE = 1_000_000;
const MIN_REASONABLE_PRICE = 0.0000001;
const MAX_REASONABLE_LIQUIDITY = 1e18;
const MAX_SLOT_ROLLBACK = 100;
const MAX_PRICE_JUMP_PCT = 50;

interface SnapshotData {
  poolAddress: string;
  dex: string;
  sqrtPriceX64: string;
  price: number;
  liquidity: number;
  tick: number;
  slot: number;
  decimalsA: number;
  decimalsB: number;
}

export class CorruptSnapshotDetector {
  private lastPrices = new Map<string, number>();
  private lastSlots = new Map<string, number>();
  private reports: CorruptSnapshotReport[] = [];

  validate(data: SnapshotData): { valid: boolean; reason?: string } {
    const reasons: string[] = [];

    if (data.price <= 0 || !isFinite(data.price)) {
      reasons.push("price<=0 or NaN");
    }

    if (data.liquidity <= 0 || !isFinite(data.liquidity)) {
      reasons.push("liquidity<=0 or NaN");
    }

    if (data.price > MAX_REASONABLE_PRICE) {
      reasons.push(`price=${data.price.toExponential(2)} absurdly high`);
    }

    if (data.price > 0 && data.price < MIN_REASONABLE_PRICE) {
      reasons.push(`price=${data.price.toExponential(2)} absurdly low`);
    }

    if (data.liquidity > MAX_REASONABLE_LIQUIDITY) {
      reasons.push(`liquidity=${data.liquidity.toExponential(2)} absurdly high`);
    }

    if (data.tick < -500000 || data.tick > 500000) {
      reasons.push(`tick=${data.tick} out of range`);
    }

    if (data.slot === 0) {
      reasons.push("slot=0");
    }

    const lastSlot = this.lastSlots.get(data.poolAddress);
    if (lastSlot !== undefined && data.slot > 0 && data.slot < lastSlot - MAX_SLOT_ROLLBACK) {
      reasons.push(`slot rollback ${lastSlot}→${data.slot}`);
    }

    const lastPrice = this.lastPrices.get(data.poolAddress);
    if (lastPrice !== undefined && lastPrice > 0 && data.price > 0) {
      const jumpPct = Math.abs(data.price - lastPrice) / lastPrice * 100;
      if (jumpPct > MAX_PRICE_JUMP_PCT) {
        reasons.push(`impossible price jump ${jumpPct.toFixed(1)}%`);
      }
    }

    if (reasons.length > 0) {
      const report: CorruptSnapshotReport = {
        poolAddress: data.poolAddress,
        dex: data.dex,
        reason: reasons.join("; "),
        data: {
          price: data.price,
          liquidity: data.liquidity,
          tick: data.tick,
          slot: data.slot,
        },
        timestamp: Date.now(),
      };

      this.reports.push(report);
      if (this.reports.length > 1000) this.reports.shift();

      logWarning(`[CORRUPT] ${data.dex} ${data.poolAddress.substring(0, 8)}... — ${reasons.join(", ")}`);
      logDebug(`[CORRUPT] data: price=${data.price} liq=${data.liquidity} tick=${data.tick} slot=${data.slot}`);

      return { valid: false, reason: reasons.join("; ") };
    }

    this.lastPrices.set(data.poolAddress, data.price);
    if (data.slot > 0) this.lastSlots.set(data.poolAddress, data.slot);

    return { valid: true };
  }

  recordValidSlot(poolAddress: string, slot: number): void {
    if (slot > 0) this.lastSlots.set(poolAddress, slot);
  }

  getReports(): CorruptSnapshotReport[] {
    return [...this.reports];
  }

  getRecentCorruptPools(): string[] {
    const seen = new Set<string>();
    for (const r of this.reports.slice(-50)) {
      seen.add(r.poolAddress);
    }
    return Array.from(seen);
  }

  clear(): void {
    this.lastPrices.clear();
    this.lastSlots.clear();
    this.reports = [];
  }
}

export const corruptSnapshotDetector = new CorruptSnapshotDetector();
