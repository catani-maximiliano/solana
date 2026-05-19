import { RejectReason } from "./account-validator";
import { logDebug, logInfo, logWarning, logSuccess } from "../logger";

interface DexMetrics {
  parseSuccess: number;
  parseFailure: number;
  rejectedBySize: number;
  rejectedByOwner: number;
  rejectedByDiscriminator: number;
  rejectedByTick: number;
  rejectedBySqrtPrice: number;
  rejectedByLiquidity: number;
  rejectedByPrice: number;
  rejectedByOther: number;
  totalUpdates: number;
  corruptUpdates: number;
  validUpdates: number;
  lastValidSlot: number;
  lastCorruptSlot: number;
  lastRejectReason: string;
  startTime: number;
}

export class AccountMetricsCollector {
  private dexes = new Map<string, DexMetrics>();

  constructor() {
    this.ensureDex("Raydium CLMM");
    this.ensureDex("Whirlpool");
    this.ensureDex("Meteora DLMM");
  }

  private ensureDex(dex: string): void {
    if (!this.dexes.has(dex)) {
      this.dexes.set(dex, {
        parseSuccess: 0,
        parseFailure: 0,
        rejectedBySize: 0,
        rejectedByOwner: 0,
        rejectedByDiscriminator: 0,
        rejectedByTick: 0,
        rejectedBySqrtPrice: 0,
        rejectedByLiquidity: 0,
        rejectedByPrice: 0,
        rejectedByOther: 0,
        totalUpdates: 0,
        corruptUpdates: 0,
        validUpdates: 0,
        lastValidSlot: 0,
        lastCorruptSlot: 0,
        lastRejectReason: "",
        startTime: Date.now(),
      });
    }
  }

  recordParseSuccess(dex: string): void {
    this.ensureDex(dex);
    const m = this.dexes.get(dex)!;
    m.parseSuccess++;
    m.totalUpdates++;
    m.validUpdates++;
  }

  recordParseFailure(dex: string): void {
    this.ensureDex(dex);
    const m = this.dexes.get(dex)!;
    m.parseFailure++;
  }

  recordRejection(dex: string, reason: RejectReason, slot: number): void {
    this.ensureDex(dex);
    const m = this.dexes.get(dex)!;
    m.totalUpdates++;
    m.corruptUpdates++;
    m.lastCorruptSlot = slot;
    m.lastRejectReason = reason;

    switch (reason) {
      case "WRONG_SIZE":           m.rejectedBySize++; break;
      case "WRONG_OWNER":          m.rejectedByOwner++; break;
      case "WRONG_DISCRIMINATOR":  m.rejectedByDiscriminator++; break;
      case "TICK_OUT_OF_RANGE":    m.rejectedByTick++; break;
      case "SQRT_PRICE_ZERO":
      case "SQRT_PRICE_OUT_OF_RANGE": m.rejectedBySqrtPrice++; break;
      case "LIQUIDITY_ZERO":
      case "LIQUIDITY_ABSURD":     m.rejectedByLiquidity++; break;
      case "PRICE_NAN":
      case "PRICE_INFINITE":
      case "PRICE_OUT_OF_BOUNDS":  m.rejectedByPrice++; break;
      default:                     m.rejectedByOther++; break;
    }

    if (m.corruptUpdates <= 5 || m.corruptUpdates % 100 === 0) {
      logDebug(`Metrics [${dex}]: rejected #${m.corruptUpdates} — ${reason} (slot=${slot})`);
    }
  }

  recordValidUpdate(dex: string, slot: number): void {
    this.ensureDex(dex);
    const m = this.dexes.get(dex)!;
    m.validUpdates++;
    m.totalUpdates++;
    m.lastValidSlot = slot;
  }

  getCorruptionRate(dex: string): number {
    const m = this.dexes.get(dex);
    if (!m || m.totalUpdates === 0) return 0;
    return m.corruptUpdates / m.totalUpdates;
  }

  getValidUpdatesPerSec(dex: string): number {
    const m = this.dexes.get(dex);
    if (!m) return 0;
    const elapsed = (Date.now() - m.startTime) / 1000;
    return elapsed > 0 ? m.validUpdates / elapsed : 0;
  }

  getStats(dex: string): DexMetrics | undefined {
    return this.dexes.get(dex);
  }

  getAllStats(): Record<string, DexMetrics> {
    const result: Record<string, DexMetrics> = {};
    for (const [dex, m] of this.dexes) {
      result[dex] = { ...m };
    }
    return result;
  }

  printSummary(): void {
    logSuccess("══════════ ACCOUNT INTEGRITY ══════════");
    for (const [dex, m] of this.dexes) {
      const rate = this.getCorruptionRate(dex);
      logInfo(`${dex}: valid=${m.validUpdates} corrupt=${m.corruptUpdates} fail=${m.parseFailure} rate=${(rate * 100).toFixed(1)}% valid/s=${this.getValidUpdatesPerSec(dex).toFixed(2)}`);
      logInfo(`  last reject: ${m.lastRejectReason || "none"} (slot ${m.lastCorruptSlot})`);
      if (m.corruptUpdates > 0) {
        logWarning(`  rejected: size=${m.rejectedBySize} owner=${m.rejectedByOwner} disc=${m.rejectedByDiscriminator} tick=${m.rejectedByTick} sqrt=${m.rejectedBySqrtPrice} liq=${m.rejectedByLiquidity} price=${m.rejectedByPrice}`);
      }
    }
  }
}

export const accountMetrics = new AccountMetricsCollector();
