import { Connection, PublicKey } from "@solana/web3.js";
import { DexPoolReader, PoolConfig, PoolType } from "./types";
import { sqrtPriceX64ToPrice } from "../math";
import { WebSocketManager } from "../ws";
import { logInfo, logWarning, logDebug, logError } from "../logger";
import { eventBus } from "../events";
import { marketState, PoolStateSnapshot } from "./state-cache";
import { marketValidator } from "../market-validator";
import { OFFICIAL_PROGRAMS } from "../config/programs";
import { TOKEN_MINTS } from "../config/pools";
import {
  validateAccountSize,
  verifyOwner,
  validatePoolFields,
  learnDiscriminator,
} from "./account-validator";
import { accountMetrics } from "./account-metrics";

const METEORA_DLMM_PROGRAM = OFFICIAL_PROGRAMS.meteoraDlmm.id;
const DEX = "Meteora DLMM";

// Meteora DLMM LB Pair account layout (Anchor 8-byte discriminator + fields):
// Offset  Size  Field
// 0       8     discriminator
// 8       32    amm_config
// 40      32    token_mint_x
// 72      32    token_mint_y
// 104     32    reserve_x
// 136     32    reserve_y
// 168     32    token_x_vault
// 200     32    token_y_vault
// 232     2     bin_step (u16)
// 234     4     active_id (i32)
// 238     2     base_fee_bps (u16)

const BIN_STEP_OFFSET = 232;
const ACTIVE_ID_OFFSET = 234;
const BASE_FEE_BPS_OFFSET = 238;
const MIN_DATA_LENGTH = 241;

function validatePublicKey(buffer: Buffer, offset: number, label: string): string | null {
  if (buffer.length < offset + 32) {
    logWarning(`Meteora DLMM: buffer insuficiente para ${label} en offset ${offset} (len ${buffer.length})`);
    return null;
  }
  const slice = buffer.slice(offset, offset + 32);
  if (slice.every((b) => b === 0)) {
    logWarning(`Meteora DLMM: ${label} es zero address en offset ${offset}`);
    return null;
  }
  try {
    return new PublicKey(slice).toBase58();
  } catch (err) {
    logWarning(`Meteora DLMM: error parseando ${label} en offset ${offset} — ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export interface MeteoraPoolLayout {
  poolAddress: string;
  mintX: string;
  mintY: string;
  binStep: number;
  activeId: number;
  baseFeeBps: number;
}

export function parseMeteoraPoolData(data: Buffer, address: string): MeteoraPoolLayout | null {
  try {
    if (data.length < MIN_DATA_LENGTH) {
      logWarning(`Meteora DLMM: datos insuficientes (${data.length} bytes, mínimo ${MIN_DATA_LENGTH}) — ${address.substring(0, 12)}...`);
      accountMetrics.recordRejection(DEX, "WRONG_SIZE", 0);
      return null;
    }

    const vsize = validateAccountSize(DEX, data.length);
    if (!vsize.valid) {
      logWarning(`Meteora DLMM: ${vsize.detail}`);
      accountMetrics.recordRejection(DEX, "WRONG_SIZE", 0);
      return null;
    }

    const discriminator = data.readBigInt64LE(0);
    learnDiscriminator(DEX, discriminator);

    const mintX = validatePublicKey(data, 40, "token_mint_x");
    if (!mintX) return null;
    const mintY = validatePublicKey(data, 72, "token_mint_y");
    if (!mintY) return null;

    const binStep = data.readUInt16LE(BIN_STEP_OFFSET);
    const activeId = data.readInt32LE(ACTIVE_ID_OFFSET);
    const baseFeeBps = data.readUInt16LE(BASE_FEE_BPS_OFFSET);

    if (binStep < 1 || binStep > 10000) {
      logWarning(`Meteora DLMM: binStep=${binStep} fuera de rango — INVALIDANDO ${address.substring(0, 12)}...`);
      accountMetrics.recordRejection(DEX, "TICK_OUT_OF_RANGE", 0);
      return null;
    }
    if (activeId < -500000 || activeId > 500000) {
      logWarning(`Meteora DLMM: activeId=${activeId} fuera de rango — INVALIDANDO ${address.substring(0, 12)}...`);
      accountMetrics.recordRejection(DEX, "TICK_OUT_OF_RANGE", 0);
      return null;
    }
    if (baseFeeBps < 0 || baseFeeBps > 10000) {
      logWarning(`Meteora DLMM: baseFeeBps=${baseFeeBps} fuera de rango — INVALIDANDO ${address.substring(0, 12)}...`);
      accountMetrics.recordRejection(DEX, "CORRUPTED_DATA", 0);
      return null;
    }

    return {
      poolAddress: address, mintX, mintY,
      binStep, activeId, baseFeeBps,
    };
  } catch (err) {
    logError(`Meteora DLMM: error fatal parseando ${address.substring(0, 12)}... — ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export class MeteoraDlmmProvider implements DexPoolReader {
  readonly dexName = DEX;
  readonly programId = METEORA_DLMM_PROGRAM;
  readonly poolType: PoolType = "dlmm";
  private connection: Connection;
  private wsManager: WebSocketManager | null = null;
  private available = false;
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private failureCount = 0;
  private trackedPools: string[] = [];
  private parseFailures = 0;
  private successfulParses = 0;
  private lastUpdate = 0;

  constructor(connection: Connection) { this.connection = connection; }

  isAvailable(): boolean { return this.available; }
  getParseFailures(): number { return this.parseFailures; }
  getSuccessfulParses(): number { return this.successfulParses; }
  getLastUpdate(): number { return this.lastUpdate; }

  attachWs(ws: WebSocketManager): void { this.wsManager = ws; }

  async start(): Promise<boolean> {
    try {
      const pubkey = new PublicKey(this.programId);
      const acc = await this.connection.getAccountInfo(pubkey);
      this.available = acc !== null && acc.executable;
      if (this.available) {
        logInfo(`Meteora DLMM: ✅ programa activo (${this.programId.substring(0, 12)}...)`);
        marketValidator.setProviderState(this.dexName, "HEALTHY");
      } else {
        logWarning(`Meteora DLMM: ❌ programa no encontrado — ${this.programId.substring(0, 12)}...`);
        marketValidator.setProviderState(this.dexName, "FAILED");
      }
      this.failureCount = 0;
    } catch (err) {
      this.available = false;
      logError("Meteora DLMM: error en start()", err);
      marketValidator.setProviderState(this.dexName, "FAILED");
    }
    return this.available;
  }

  async trackPool(poolAddress: string, feeBps?: number): Promise<void> {
    if (!poolAddress || poolAddress.length < 32 || /^1{32,}$/.test(poolAddress)) {
      logWarning(`Meteora DLMM: dirección inválida ignorada — "${poolAddress?.substring(0, 12)}..."`);
      return;
    }

    if (this.trackedPools.includes(poolAddress)) return;
    this.trackedPools.push(poolAddress);

    try {
      const pubkey = new PublicKey(poolAddress);

      const acc = await this.connection.getAccountInfo(pubkey);

      const vown = await verifyOwner(this.connection, poolAddress, METEORA_DLMM_PROGRAM);
      if (!vown.valid) {
        logWarning(`Meteora DLMM: ${vown.detail} — RECHAZANDO pool ${poolAddress.substring(0, 12)}...`);
        accountMetrics.recordRejection(DEX, "WRONG_OWNER", 0);
        return;
      }

      if (acc && acc.data.length >= MIN_DATA_LENGTH) {
        const parsed = parseMeteoraPoolData(acc.data, poolAddress);
        if (parsed) {
          marketState.recordMintOrder(poolAddress, parsed.mintX, parsed.mintY);
          this.emitPoolUpdate(parsed, 0);
          const price = this.computePrice(parsed);
          logInfo(`Meteora DLMM: pool ${poolAddress.substring(0, 8)}... cargado ✅ (activeId: ${parsed.activeId}, binStep: ${parsed.binStep}, fee: ${parsed.baseFeeBps}bps, price: ${price.toFixed(6)})`);
        } else {
          logWarning(`Meteora DLMM: pool ${poolAddress.substring(0, 8)}... no se pudo parsear (${acc.data.length} bytes)`);
          this.parseFailures++;
        }
      } else {
        logWarning(`Meteora DLMM: pool ${poolAddress.substring(0, 8)}... datos insuficientes (${acc?.data.length || 0} bytes)`);
      }

      if (this.wsManager) {
        this.wsManager.subscribeAccount(poolAddress, (data, slot) => {
          if (!data || data.length < MIN_DATA_LENGTH) return;
          const vsize = validateAccountSize(DEX, data.length);
          if (!vsize.valid) {
            accountMetrics.recordRejection(DEX, "WRONG_SIZE", slot);
            return;
          }
          const parsed = parseMeteoraPoolData(data, poolAddress);
          if (parsed) {
            accountMetrics.recordParseSuccess(DEX);
            this.emitPoolUpdate(parsed, slot);
          } else {
            this.parseFailures++;
          }
        }, "confirmed");
      }
    } catch (err) {
      logError(`Meteora DLMM: error trackeando pool ${poolAddress.substring(0, 12)}...`, err);
    }
  }

  private computePrice(parsed: MeteoraPoolLayout): number {
    const decimalsA = (TOKEN_MINTS as Record<string, number>)[parsed.mintX] ?? 9;
    const decimalsB = (TOKEN_MINTS as Record<string, number>)[parsed.mintY] ?? 9;
    const rawPrice = Math.pow(1 + parsed.binStep / 10000, parsed.activeId);
    return rawPrice * Math.pow(10, decimalsA - decimalsB);
  }

  private computeSqrtPrice(parsed: MeteoraPoolLayout): bigint {
    const priceFactor = Math.pow(1 + parsed.binStep / 10000, parsed.activeId / 2);
    if (!isFinite(priceFactor) || priceFactor <= 0) return 0n;
    return BigInt(Math.floor(priceFactor * 2 ** 64));
  }

  private getLiquidity(): bigint {
    return 10_000_000_000_000n;
  }

  private emitPoolUpdate(parsed: MeteoraPoolLayout, slot: number): void {
    this.successfulParses++;
    this.lastUpdate = Date.now();

    const decimalsA = (TOKEN_MINTS as Record<string, number>)[parsed.mintX] ?? 9;
    const decimalsB = (TOKEN_MINTS as Record<string, number>)[parsed.mintY] ?? 9;

    const sqrtPriceX64 = this.computeSqrtPrice(parsed);
    if (sqrtPriceX64 === 0n) {
      logWarning(`Meteora DLMM: sqrtPrice=0 — saltando update para ${parsed.poolAddress.substring(0, 8)}...`);
      return;
    }

    const liquidity = this.getLiquidity();

    const snapshot: PoolStateSnapshot = {
      poolAddress: parsed.poolAddress,
      dex: this.dexName,
      mintA: parsed.mintX,
      mintB: parsed.mintY,
      decimalsA,
      decimalsB,
      sqrtPriceX64: sqrtPriceX64.toString(),
      liquidity: liquidity.toString(),
      tick: parsed.activeId,
      fee: parsed.baseFeeBps,
      slot,
      timestamp: Date.now(),
      dataQuality: "VALID",
      source: "ON_CHAIN_VALIDATED",
    };

    marketState.updatePool(snapshot);

    eventBus.emit({
      type: "pool:update",
      timestamp: Date.now(),
      data: {
        poolAddress: parsed.poolAddress,
        dex: this.dexName,
        slot,
        sqrtPriceX64: sqrtPriceX64.toString(),
        liquidity: liquidity.toString(),
        tick: parsed.activeId,
      },
    });
  }

  async getPoolPrice(poolAddress: string): Promise<{ price: number; liquidity: number } | null> {
    const cached = marketState.getPool(poolAddress);
    if (cached) {
      return {
        price: sqrtPriceX64ToPrice(BigInt(cached.sqrtPriceX64), cached.decimalsA, cached.decimalsB),
        liquidity: Number(cached.liquidity),
      };
    }

    try {
      const acc = await this.connection.getAccountInfo(new PublicKey(poolAddress));
      if (!acc || acc.data.length < MIN_DATA_LENGTH) return null;

      const vown = await verifyOwner(this.connection, poolAddress, METEORA_DLMM_PROGRAM);
      if (!vown.valid) return null;

      const parsed = parseMeteoraPoolData(acc.data, poolAddress);
      if (!parsed) return null;
      marketState.recordMintOrder(poolAddress, parsed.mintX, parsed.mintY);
      this.emitPoolUpdate(parsed, 0);

      const price = this.computePrice(parsed);
      return { price, liquidity: Number(this.getLiquidity()) };
    } catch {
      return null;
    }
  }

  getTrackedPools(): string[] { return [...this.trackedPools]; }

  async getPoolConfig(poolAddress: string): Promise<PoolConfig | null> {
    try {
      if (!poolAddress || poolAddress.length < 32) return null;
      const acc = await this.connection.getAccountInfo(new PublicKey(poolAddress));
      if (!acc || acc.data.length < MIN_DATA_LENGTH) return null;
      const p = parseMeteoraPoolData(acc.data, poolAddress);
      if (!p) return null;
      const decimalsA = (TOKEN_MINTS as Record<string, number>)[p.mintX] ?? 9;
      const decimalsB = (TOKEN_MINTS as Record<string, number>)[p.mintY] ?? 9;
      return {
        address: poolAddress, dex: this.dexName, poolType: "dlmm",
        mintA: p.mintX, mintB: p.mintY,
        decimalsA, decimalsB,
        fee: p.baseFeeBps, tickSpacing: p.binStep,
      };
    } catch {
      return null;
    }
  }

  scheduleRecovery(): void {
    this.available = false;
    marketValidator.setProviderState(this.dexName, "RECOVERING");
    this.failureCount++;
    if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
    this.recoveryTimer = setTimeout(async () => {
      const ok = await this.start();
      if (ok) {
        logInfo(`Meteora DLMM: recuperado tras ${this.failureCount} fallos`);
        for (const p of this.trackedPools) await this.trackPool(p).catch(() => {});
      }
    }, Math.min(60000, 5000 * Math.pow(2, this.failureCount)));
  }

  destroy(): void { if (this.recoveryTimer) clearTimeout(this.recoveryTimer); this.trackedPools = []; this.available = false; }
}
