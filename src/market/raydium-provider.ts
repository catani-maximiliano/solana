import { Connection, PublicKey } from "@solana/web3.js";
import { DexPoolReader, PoolConfig, PoolType } from "./types";
import { sqrtPriceX64ToPrice } from "../math";
import { WebSocketManager } from "../ws";
import { logInfo, logWarning, logDebug, logError } from "../logger";
import { eventBus } from "../events";
import { marketState, PoolStateSnapshot } from "./state-cache";
import { marketValidator } from "../market-validator";
import { OFFICIAL_PROGRAMS } from "../config/programs";
import {
    validateAccountSize,
    validateDiscriminator,
    verifyOwner,
    validatePoolFields,
} from "./account-validator";
import { accountMetrics } from "./account-metrics";

const POLL_STALE_MS = 25000;

const RAYDIUM_CLMM_PROGRAM = OFFICIAL_PROGRAMS.raydiumClmm.id;
const DEX = "Raydium CLMM";

interface RaydiumPoolLayout {
  poolAddress: string;
  mintA: string;
  mintB: string;
  decimalsA: number;
  decimalsB: number;
  sqrtPriceX64: bigint;
  liquidity: bigint;
  tickCurrent: number;
  fee: number;
  tickSpacing: number;
  tokenVaultA: string;
  tokenVaultB: string;
}

function parseRaydiumPoolData(data: Buffer, address: string): RaydiumPoolLayout | null {
  try {
    if (data.length < 300) {
      logWarning(`Raydium CLMM: datos insuficientes para ${address.substring(0, 8)}... (${data.length} bytes, mínimo 300)`);
      accountMetrics.recordRejection(DEX, "WRONG_SIZE", 0);
      return null;
    }
    if (data.length !== 1544) {
      logWarning(`Raydium CLMM: tamaño inesperado ${data.length} bytes para ${address.substring(0, 8)}... (esperado 1544)`);
    }

    const vsize = validateAccountSize(DEX, data.length);
    if (!vsize.valid) {
      logWarning(`Raydium CLMM: ${vsize.detail}`);
      accountMetrics.recordRejection(DEX, "WRONG_SIZE", 0);
      return null;
    }

    const discriminator = data.readBigInt64LE(0);
    const vdisc = validateDiscriminator(DEX, discriminator);
    if (!vdisc.valid) {
      logWarning(`Raydium CLMM: ${vdisc.detail}`);
      accountMetrics.recordRejection(DEX, "WRONG_DISCRIMINATOR", 0);
      return null;
    }

    const mintA = new PublicKey(data.slice(73, 105)).toBase58();
    const mintB = new PublicKey(data.slice(105, 137)).toBase58();
    const tokenVaultA = new PublicKey(data.slice(137, 169)).toBase58();
    const tokenVaultB = new PublicKey(data.slice(169, 201)).toBase58();
    const observationKey = new PublicKey(data.slice(201, 233)).toBase58();
    const decimalsA = data.readUInt8(233);
    const decimalsB = data.readUInt8(234);
    const tickSpacing = data.readUInt16LE(235);
    const liqLo = data.readBigUInt64LE(237);
    const liqHi = data.readBigUInt64LE(245);
    const liquidity = liqLo + (liqHi << 64n);
    const sqrtLo = data.readBigUInt64LE(253);
    const sqrtHi = data.readBigUInt64LE(261);
    const sqrtPriceX64 = sqrtLo + (sqrtHi << 64n);
    const tickCurrent = data.readInt32LE(269);

    const vfields = validatePoolFields(tickCurrent, sqrtPriceX64, liquidity, 0);
    if (!vfields.valid) {
      logWarning(`Raydium CLMM: ${vfields.reason} — ${vfields.detail || ""} INVALIDANDO pool ${address.substring(0, 12)}...`);
      accountMetrics.recordRejection(DEX, vfields.reason!, 0);
      return null;
    }

    return {
      poolAddress: address, mintA, mintB, decimalsA, decimalsB,
      sqrtPriceX64, liquidity, tickCurrent, fee: 0, tickSpacing,
      tokenVaultA, tokenVaultB,
    };
  } catch (err) {
    logError(`Raydium CLMM: error parseando pool ${address.substring(0, 12)}... — ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export class RaydiumClmmProvider implements DexPoolReader {
  readonly dexName = DEX;
  readonly programId = RAYDIUM_CLMM_PROGRAM;
  readonly poolType: PoolType = "clmm";

  private connection: Connection;
  private wsManager: WebSocketManager | null = null;
  private available = false;
  private trackedPools: string[] = [];
  private poolFees: Map<string, number> = new Map();
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private failureCount = 0;
  private parseFailures = 0;
  private successfulParses = 0;
  private lastUpdate = 0;
  private poolLastUpdate = new Map<string, number>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  isAvailable(): boolean { return this.available; }
  getParseFailures(): number { return this.parseFailures; }
  getSuccessfulParses(): number { return this.successfulParses; }
  getLastUpdate(): number { return this.lastUpdate; }

  attachWs(ws: WebSocketManager): void {
    this.wsManager = ws;
  }

  async start(): Promise<boolean> {
    try {
      const acc = await this.connection.getAccountInfo(new PublicKey(this.programId));
      this.available = acc !== null && acc.executable;
      if (this.available) {
        logInfo(`Raydium CLMM: ✅ programa activo (${this.programId.substring(0, 12)}...)`);
        marketValidator.setProviderState(this.dexName, "HEALTHY");
      } else {
        logWarning(`Raydium CLMM: ❌ programa no encontrado — ${this.programId.substring(0, 12)}...`);
        marketValidator.setProviderState(this.dexName, "FAILED");
      }
      this.failureCount = 0;
    } catch (err) {
      this.available = false;
      logError("Raydium CLMM: error verificando programa", err);
      marketValidator.setProviderState(this.dexName, "FAILED");
    }
    return this.available;
  }

  async trackPool(poolAddress: string, feeBps?: number): Promise<void> {
    if (!poolAddress || poolAddress.length < 32) {
      logWarning(`Raydium CLMM: dirección inválida ignorada`);
      return;
    }
    if (this.trackedPools.includes(poolAddress)) return;
    this.trackedPools.push(poolAddress);
    if (feeBps !== undefined) {
      this.poolFees.set(poolAddress, feeBps);
    }

    try {
      const pubkey = new PublicKey(poolAddress);

      const acc = await this.connection.getAccountInfo(pubkey);
      if (!acc) {
        logWarning(`Raydium CLMM: pool ${poolAddress.substring(0, 12)}... NO ENCONTRADO en RPC`);
        return;
      }

      const vown = await verifyOwner(this.connection, poolAddress, RAYDIUM_CLMM_PROGRAM);
      if (!vown.valid) {
        logWarning(`Raydium CLMM: ${vown.detail} — RECHAZANDO pool ${poolAddress.substring(0, 12)}...`);
        accountMetrics.recordRejection(DEX, "WRONG_OWNER", 0);
        return;
      }

      const parsed = parseRaydiumPoolData(acc.data, poolAddress);
      if (parsed) {
        this.emitPoolUpdate(parsed, 0, feeBps);
        marketState.recordMintOrder(poolAddress, parsed.mintA, parsed.mintB);
        logInfo(`Raydium CLMM: pool ${poolAddress.substring(0, 8)}... cargado ✅ (tick: ${parsed.tickCurrent}, price: ${sqrtPriceX64ToPrice(parsed.sqrtPriceX64, parsed.decimalsA, parsed.decimalsB).toFixed(6)})`);

        // Only subscribe to WS updates if initial parse succeeded (account IS a pool state)
        if (this.wsManager) {
          this.wsManager.subscribeAccount(poolAddress, (data, slot) => {
            if (!data || data.length < 300) return;
            const vsize = validateAccountSize(DEX, data.length);
            if (!vsize.valid) {
              accountMetrics.recordRejection(DEX, "WRONG_SIZE", slot);
              return;
            }
            const parsed = parseRaydiumPoolData(data, poolAddress);
            if (parsed) {
              accountMetrics.recordParseSuccess(DEX);
              const fee = this.poolFees.get(poolAddress) ?? 0;
              this.emitPoolUpdate(parsed, slot, fee);
            } else {
              this.parseFailures++;
            }
          });
        }
      } else {
        logWarning(`Raydium CLMM: pool ${poolAddress.substring(0, 8)}... parseo falló (${acc.data.length} bytes) — NO es CLMM pool state`);
        this.parseFailures++;
      }

      // Start periodic pool refresh timer on first tracked pool
      if (!this.pollTimer && this.trackedPools.some(p => this.poolLastUpdate.has(p))) {
        this.pollTimer = setInterval(() => this.pollStalePools(), 15000);
      }
    } catch (err) {
      logError(`Raydium CLMM: error trackeando pool ${poolAddress.substring(0, 12)}...`, err);
    }
  }

  private emitPoolUpdate(parsed: RaydiumPoolLayout, slot: number, fee?: number): void {
    this.successfulParses++;
    const now = Date.now();
    this.lastUpdate = now;
    this.poolLastUpdate.set(parsed.poolAddress, now);

    const snapshot: PoolStateSnapshot = {
      poolAddress: parsed.poolAddress,
      dex: this.dexName,
      mintA: parsed.mintA,
      mintB: parsed.mintB,
      decimalsA: parsed.decimalsA,
      decimalsB: parsed.decimalsB,
      sqrtPriceX64: parsed.sqrtPriceX64.toString(),
      liquidity: parsed.liquidity.toString(),
      tick: parsed.tickCurrent,
      fee: fee ?? parsed.fee,
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
        sqrtPriceX64: parsed.sqrtPriceX64.toString(),
        liquidity: parsed.liquidity.toString(),
        tick: parsed.tickCurrent,
      },
    });
  }

  async getPoolPrice(poolAddress: string): Promise<{ price: number; liquidity: number } | null> {
    const cached = marketState.getPool(poolAddress);
    if (cached) {
      const price = sqrtPriceX64ToPrice(BigInt(cached.sqrtPriceX64), cached.decimalsA, cached.decimalsB);
      return { price, liquidity: Number(cached.liquidity) };
    }

    try {
      const acc = await this.connection.getAccountInfo(new PublicKey(poolAddress));
      if (!acc || acc.data.length < 300 || !isFinite(Number(acc.data.length))) return null;

      const vown = await verifyOwner(this.connection, poolAddress, RAYDIUM_CLMM_PROGRAM);
      if (!vown.valid) return null;

      const parsed = parseRaydiumPoolData(acc.data, poolAddress);
      if (!parsed) return null;
      const fee = this.poolFees.get(poolAddress) ?? 0;
      this.emitPoolUpdate(parsed, 0, fee);

      const price = sqrtPriceX64ToPrice(parsed.sqrtPriceX64, parsed.decimalsA, parsed.decimalsB);
      return { price, liquidity: Number(parsed.liquidity) };
    } catch {
      return null;
    }
  }

  async getPoolConfig(poolAddress: string): Promise<PoolConfig | null> {
    try {
      const acc = await this.connection.getAccountInfo(new PublicKey(poolAddress));
      if (!acc || acc.data.length < 300) return null;
      const parsed = parseRaydiumPoolData(acc.data, poolAddress);
      if (!parsed) return null;
      return {
        address: poolAddress, dex: this.dexName, poolType: "clmm",
        mintA: parsed.mintA, mintB: parsed.mintB,
        decimalsA: parsed.decimalsA, decimalsB: parsed.decimalsB,
        fee: parsed.fee, tickSpacing: parsed.tickSpacing,
      };
    } catch {
      return null;
    }
  }

  getTrackedPools(): string[] { return [...this.trackedPools]; }

  scheduleRecovery(): void {
    this.available = false;
    marketValidator.setProviderState(this.dexName, "RECOVERING");
    this.failureCount++;
    if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
    this.recoveryTimer = setTimeout(async () => {
      const ok = await this.start();
      if (ok) {
        logInfo(`Raydium CLMM: recuperado tras ${this.failureCount} fallos`);
        for (const pool of this.trackedPools) {
          await this.trackPool(pool).catch(() => {});
        }
      }
    }, Math.min(60000, 5000 * Math.pow(2, this.failureCount)));
  }

  private async pollStalePools(): Promise<void> {
    const now = Date.now();
    for (const poolAddr of this.trackedPools) {
      const lastUpd = this.poolLastUpdate.get(poolAddr) || 0;
      if (now - lastUpd < POLL_STALE_MS) continue;
      try {
        const pubkey = new PublicKey(poolAddr);
        const acc = await this.connection.getAccountInfo(pubkey);
        if (!acc || acc.data.length < 300) continue;
        const parsed = parseRaydiumPoolData(acc.data, poolAddr);
        if (parsed) {
          const fee = this.poolFees.get(poolAddr) ?? 0;
          this.emitPoolUpdate(parsed, 0, fee);
          logDebug(`Raydium CLMM: pool ${poolAddr.substring(0, 8)}... refreshed via poll`);
        }
      } catch {
        // ignore individual poll failures
      }
    }
  }

  destroy(): void {
    if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.trackedPools = [];
    this.available = false;
  }
}
