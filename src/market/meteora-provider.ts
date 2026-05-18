import { Connection, PublicKey } from "@solana/web3.js";
import { DexPoolReader, PoolConfig, PoolType } from "./types";
import { sqrtPriceX64ToPrice } from "../math";
import { WebSocketManager } from "../ws";
import { logInfo, logWarning, logDebug, logError } from "../logger";
import { eventBus } from "../events";
import { marketState, PoolStateSnapshot } from "./state-cache";
import { marketValidator } from "../market-validator";
import { OFFICIAL_PROGRAMS } from "../config/programs";

const METEORA_DLMM_PROGRAM = OFFICIAL_PROGRAMS.meteoraDlmm.id;

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
  decimalsA: number;
  decimalsB: number;
  binStep: number;
  activeId: number;
  baseFeeBps: number;
  totalLiquidity: bigint;
  reserveX: bigint;
  reserveY: bigint;
}

export function parseMeteoraPoolData(data: Buffer, address: string): MeteoraPoolLayout | null {
  try {
    const requiredLen = 80;
    if (data.length < requiredLen) {
      logWarning(`Meteora DLMM: datos insuficientes (${data.length} bytes, mínimo ${requiredLen}) — ${address.substring(0, 12)}...`);
      return null;
    }

    const mintX = validatePublicKey(data, 8, "mintX");
    if (!mintX) return null;
    const mintY = validatePublicKey(data, 40, "mintY");
    if (!mintY) return null;

    const binStep = data.readUInt16LE(72);
    const activeId = data.readInt32LE(74);
    const baseFeeBps = data.readUInt16LE(78);

    return {
      poolAddress: address, mintX, mintY,
      decimalsA: 9, decimalsB: 6,
      binStep, activeId, baseFeeBps,
      totalLiquidity: 0n, reserveX: 0n, reserveY: 0n,
    };
  } catch (err) {
    logError(`Meteora DLMM: error fatal parseando ${address.substring(0, 12)}... — ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export class MeteoraDlmmProvider implements DexPoolReader {
  readonly dexName = "Meteora DLMM";
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
      if (acc && acc.data.length >= 80) {
        const parsed = parseMeteoraPoolData(acc.data, poolAddress);
        if (parsed) {
          logInfo(`Meteora DLMM: pool ${poolAddress.substring(0, 8)}... cargado ✅ (active bin: ${parsed.activeId}, binStep: ${parsed.binStep}, fee: ${parsed.baseFeeBps}bps)`);
          this.successfulParses++;
        } else {
          logWarning(`Meteora DLMM: pool ${poolAddress.substring(0, 8)}... no se pudo parsear (${acc.data.length} bytes)`);
          this.parseFailures++;
        }
      } else {
        logWarning(`Meteora DLMM: pool ${poolAddress.substring(0, 8)}... datos insuficientes (${acc?.data.length || 0} bytes)`);
      }

      if (this.wsManager) {
        this.wsManager.subscribeAccount(poolAddress, (data, slot) => {
          if (!data || data.length < 80) return;
          const parsed = parseMeteoraPoolData(data, poolAddress);
          if (parsed) {
            this.successfulParses++;
            this.lastUpdate = Date.now();
          } else {
            this.parseFailures++;
          }
        }, "confirmed");
      }
    } catch (err) {
      logError(`Meteora DLMM: error trackeando pool ${poolAddress.substring(0, 12)}...`, err);
    }
  }

  async getPoolPrice(poolAddress: string): Promise<{ price: number; liquidity: number } | null> {
    return null;
  }

  getTrackedPools(): string[] { return [...this.trackedPools]; }

  async getPoolConfig(poolAddress: string): Promise<PoolConfig | null> {
    try {
      if (!poolAddress || poolAddress.length < 32) return null;
      const acc = await this.connection.getAccountInfo(new PublicKey(poolAddress));
      if (!acc || acc.data.length < 80) return null;
      const p = parseMeteoraPoolData(acc.data, poolAddress);
      if (!p) return null;
      return {
        address: poolAddress, dex: this.dexName, poolType: "dlmm",
        mintA: p.mintX, mintB: p.mintY,
        decimalsA: 6, decimalsB: 6,
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
