import { Connection, PublicKey } from "@solana/web3.js";
import { DexPoolReader, PoolConfig, PoolType } from "./types";
import { sqrtPriceX64ToPrice } from "../math";
import { WebSocketManager } from "../ws";
import { logInfo, logWarning, logDebug, logError, logSuccess } from "../logger";
import { eventBus } from "../events";
import { marketState, PoolStateSnapshot } from "./state-cache";
import { marketValidator } from "../market-validator";
import { OFFICIAL_PROGRAMS } from "../config/programs";
import { config } from "../config";
import { POOL_REGISTRY, TOKEN_MINTS } from "../config/pools";
import {
  validateAccountSize,
  verifyOwner,
  validatePoolFields,
  learnDiscriminator,
} from "./account-validator";
import { accountMetrics } from "./account-metrics";

const WHIRLPOOL_PROGRAM = OFFICIAL_PROGRAMS.whirlpool.id;
const DEX = "Whirlpool";

export type WhirlpoolState = "INITIALIZED" | "CONNECTED" | "SUBSCRIBED" | "RECEIVING_DATA" | "HEALTHY" | "DEGRADED" | "FAILED" | "SHUTDOWN";

interface WhirlpoolLayout {
  poolAddress: string;
  mintA: string;
  mintB: string;
  sqrtPrice: bigint;
  liquidity: bigint;
  tickCurrentIndex: number;
  fee: number;
  tickSpacing: number;
  tokenVaultA: string;
  tokenVaultB: string;
}

function parseWhirlpoolData(data: Buffer, address: string): WhirlpoolLayout | null {
  try {
    const requiredLen = 85;
    if (data.length < requiredLen) {
      logDebug(`Whirlpool: datos insuficientes (${data.length} bytes, mínimo ${requiredLen}) — ${address.substring(0, 12)}...`);
      accountMetrics.recordRejection(DEX, "WRONG_SIZE", 0);
      return null;
    }

    const vsize = validateAccountSize(DEX, data.length);
    if (!vsize.valid) {
      logWarning(`Whirlpool: ${vsize.detail}`);
      accountMetrics.recordRejection(DEX, "WRONG_SIZE", 0);
      return null;
    }

    if (config.debugMode) {
      const hex = (start: number, len: number) =>
        data.slice(start, start + len).toString("hex").match(/.{1,2}/g)?.join(" ") || "";
      logDebug(`Whirlpool raw [${address.substring(0, 8)}]: ${data.length} bytes`);
      logDebug(` hex[0..8] (discriminator):         ${hex(0, 8)}`);
      logDebug(` hex[40..49] (bump+spacing+seed): ${hex(40, 9)}`);
      logDebug(` hex[49..64] (liquidity):         ${hex(49, 16)}`);
      logDebug(` hex[65..80] (sqrt_price):        ${hex(65, 16)}`);
      logDebug(` hex[81..84] (tick):              ${hex(81, 4)}`);
      logDebug(` hex[101..132] (token_mint_a):    ${hex(101, 32)}`);
      logDebug(` hex[181..212] (token_mint_b):    ${hex(181, 32)}`);
    }

    let mintA: string, mintB: string, tokenVaultA: string, tokenVaultB: string;
    try {
      mintA = new PublicKey(data.slice(101, 133)).toBase58();
      mintB = new PublicKey(data.slice(181, 213)).toBase58();
      tokenVaultA = new PublicKey(data.slice(133, 165)).toBase58();
      tokenVaultB = new PublicKey(data.slice(213, 245)).toBase58();
    } catch (e) {
      logWarning(`Whirlpool: error parseando PublicKeys de ${address.substring(0, 12)}... — ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }

    const tickSpacing = data.readUInt16LE(41);
    const feeRate = data.readUInt16LE(45);
    const protocolFeeRate = data.readUInt16LE(47);

    const liquidityLow = data.readBigUInt64LE(49);
    const liquidityHigh = data.readBigUInt64LE(57);
    const liquidity = (liquidityHigh << 64n) | liquidityLow;

    const sqrtPriceLow = data.readBigUInt64LE(65);
    const sqrtPriceHigh = data.readBigUInt64LE(73);
    const sqrtPrice = (sqrtPriceHigh << 64n) | sqrtPriceLow;

    const tickCurrentIndex = data.readInt32LE(81);

    const fee = Math.min(10000, Math.round(feeRate / 100));

    const vfields = validatePoolFields(tickCurrentIndex, sqrtPrice, liquidity, fee);
    if (!vfields.valid) {
      logWarning(`Whirlpool: ${vfields.reason} — ${vfields.detail || ""} INVALIDANDO ${address.substring(0, 12)}...`);
      accountMetrics.recordRejection(DEX, vfields.reason!, 0);
      return null;
    }

    learnDiscriminator(DEX, data.readBigInt64LE(0));

    if (config.debugMode) {
      logDebug(`Whirlpool parsed [${address.substring(0, 8)}]: mintA=${mintA.substring(0, 8)}... mintB=${mintB.substring(0, 8)}... sqrtPrice=${sqrtPrice} tick=${tickCurrentIndex} liq=${liquidity} fee_raw=${feeRate}(hundredths_bps) fee=${fee}bps tickSpacing=${tickSpacing}`);
    }

    return {
      poolAddress: address, mintA, mintB,
      sqrtPrice, liquidity, tickCurrentIndex, fee, tickSpacing,
      tokenVaultA, tokenVaultB,
    };
  } catch (err) {
    logError(`Whirlpool: error fatal parseando ${address.substring(0, 12)}... — ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export class WhirlpoolProvider implements DexPoolReader {
  readonly dexName = DEX;
  readonly programId = WHIRLPOOL_PROGRAM;
  readonly poolType: PoolType = "clmm";
  private connection: Connection;
  private wsManager: WebSocketManager | null = null;
  private state: WhirlpoolState = "INITIALIZED";
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private failureCount = 0;
  private trackedPools: string[] = [];
  private parseFailures = 0;
  private successfulParses = 0;
  private lastUpdate = 0;
  private firstUpdate = 0;
  private updateCount = 0;
  private wsSubKey: string = "";

  constructor(connection: Connection) { this.connection = connection; }

  getState(): WhirlpoolState { return this.state; }
  isAvailable(): boolean { return this.state === "HEALTHY" || this.state === "RECEIVING_DATA" || this.state === "SUBSCRIBED"; }
  getParseFailures(): number { return this.parseFailures; }
  getSuccessfulParses(): number { return this.successfulParses; }
  getLastUpdate(): number { return this.lastUpdate; }
  getUpdateCount(): number { return this.updateCount; }
  getStateLabel(): string {
    const labels: Record<WhirlpoolState, string> = {
      INITIALIZED: "⏳ INITIALIZED",
      CONNECTED: "🔗 CONNECTED",
      SUBSCRIBED: "📡 SUBSCRIBED",
      RECEIVING_DATA: "📥 RECEIVING_DATA",
      HEALTHY: "✅ HEALTHY",
      DEGRADED: "⚠️ DEGRADED",
      FAILED: "❌ FAILED",
      SHUTDOWN: "⏹️ SHUTDOWN",
    };
    return labels[this.state] || this.state;
  }

  private setState(newState: WhirlpoolState): void {
    if (this.state === newState) return;
    const old = this.state;
    this.state = newState;
    logInfo(`Whirlpool: ${old} → ${newState}`);

    if (newState === "HEALTHY" || newState === "RECEIVING_DATA") {
      marketValidator.setProviderState(this.dexName, "HEALTHY");
    } else if (newState === "DEGRADED") {
      marketValidator.setProviderState(this.dexName, "DEGRADED");
    } else if (newState === "FAILED") {
      marketValidator.setProviderState(this.dexName, "FAILED");
    }
  }

  attachWs(ws: WebSocketManager): void {
    this.wsManager = ws;
    if (this.state === "INITIALIZED") {
      this.setState("CONNECTED");
    }
  }

  async start(): Promise<boolean> {
    try {
      const pubkey = new PublicKey(this.programId);
      const acc = await this.connection.getAccountInfo(pubkey);
      const programFound = acc !== null && acc.executable;

      if (programFound) {
        logInfo(`Whirlpool: programa ${this.programId.substring(0, 12)}... VÁLIDO`);
        if (this.state === "CONNECTED" || this.state === "INITIALIZED") {
          this.setState("CONNECTED");
        }
      } else {
        logWarning(`Whirlpool: programa ${this.programId.substring(0, 12)}... NO ENCONTRADO — subscriptions directas vía WS igualmente`);
        if (this.state === "INITIALIZED") {
          this.setState("CONNECTED");
        }
      }

      this.failureCount = 0;
      return true;
    } catch (err) {
      logError("Whirlpool: error en start()", err);
      this.setState("FAILED");
      return false;
    }
  }

  async trackPool(poolAddress: string, feeBps?: number): Promise<void> {
    if (!poolAddress || poolAddress.length < 32) {
      logWarning(`Whirlpool: dirección inválida — "${poolAddress}"`);
      return;
    }
    if (this.trackedPools.includes(poolAddress)) {
      logDebug(`Whirlpool: pool ${poolAddress.substring(0, 8)}... ya trackeado`);
      return;
    }
    this.trackedPools.push(poolAddress);

    logInfo(`Whirlpool: trackeando pool ${poolAddress.substring(0, 12)}...`);

    try {
      const pubkey = new PublicKey(poolAddress);
      logDebug(`Whirlpool: fetch inicial de pool ${poolAddress.substring(0, 8)}...`);
      const acc = await this.connection.getAccountInfo(pubkey);

      if (acc) {
        logInfo(`Whirlpool: account info recibido — ${acc.data.length} bytes, executable=${acc.executable}, lamports=${acc.lamports}`);
      } else {
        logWarning(`Whirlpool: account ${poolAddress.substring(0, 12)}... NO ENCONTRADO en RPC`);
      }

      const vown = await verifyOwner(this.connection, poolAddress, WHIRLPOOL_PROGRAM);
      if (!vown.valid) {
        logWarning(`Whirlpool: ${vown.detail} — RECHAZANDO pool ${poolAddress.substring(0, 12)}...`);
        accountMetrics.recordRejection(DEX, "WRONG_OWNER", 0);
        return;
      }

      if (acc && acc.data.length >= 85) {
        const currentSlot = await this.connection.getSlot("confirmed").catch(() => 0);
        logDebug(`Whirlpool: slot actual en fetch inicial: ${currentSlot}`);
        const parsed = parseWhirlpoolData(acc.data, poolAddress);
        if (parsed) {
          this.emitPoolUpdate(parsed, currentSlot);
          marketState.recordMintOrder(poolAddress, parsed.mintA, parsed.mintB);
          logSuccess(`Whirlpool: ✅ pool ${poolAddress.substring(0, 8)}... parseado OK en carga inicial (slot=${currentSlot})`);
        } else {
          logWarning(`Whirlpool: ❌ pool ${poolAddress.substring(0, 8)}... no se pudo parsear (${acc.data.length} bytes)`);
          this.parseFailures++;
        }
      } else {
        logWarning(`Whirlpool: datos insuficientes (${acc?.data.length || 0} bytes) — pool data puede requerir encoding especial`);
      }

      if (this.wsManager) {
        const subKey = `account:${poolAddress}`;
        logInfo(`Whirlpool: pasando WS subscription al gestor central`);
        this.wsSubKey = subKey;
        this.setState("SUBSCRIBED");
        logSuccess(`Whirlpool: 📡 subscription activa para ${poolAddress.substring(0, 8)}... (gestionada centralmente)`);
      } else {
        logWarning(`Whirlpool: ⚠️ WS Manager no disponible para subscriptions`);
      }
    } catch (err) {
      logError(`Whirlpool: error trackeando pool ${poolAddress.substring(0, 12)}...`, err);
      this.parseFailures++;
    }
  }

  private emitPoolUpdate(parsed: WhirlpoolLayout, slot: number): void {
    const sqrtPriceX64 = parsed.sqrtPrice.toString();
    const liquidity = parsed.liquidity.toString();

    const mintA = parsed.mintA;
    const mintB = parsed.mintB;
    const decimalsA = (TOKEN_MINTS as Record<string, number>)[parsed.mintA] ?? 9;
    const decimalsB = (TOKEN_MINTS as Record<string, number>)[parsed.mintB] ?? 9;

    const snapshot: PoolStateSnapshot = {
      poolAddress: parsed.poolAddress,
      dex: this.dexName,
      mintA,
      mintB,
      decimalsA,
      decimalsB,
      sqrtPriceX64,
      liquidity,
      tick: parsed.tickCurrentIndex,
      fee: parsed.fee,
      slot,
      timestamp: Date.now(),
      dataQuality: "VALID",
      source: "ON_CHAIN_VALIDATED",
    };

    logDebug(`Whirlpool emit [${parsed.poolAddress.substring(0, 8)}]: slot=${slot} sqrtPrice=${sqrtPriceX64} tick=${parsed.tickCurrentIndex} liq=${liquidity}`);

    marketState.updatePool(snapshot);

    eventBus.emit({
      type: "pool:update",
      timestamp: Date.now(),
      data: {
        poolAddress: parsed.poolAddress,
        dex: this.dexName,
        slot,
        sqrtPriceX64,
        liquidity,
        tick: parsed.tickCurrentIndex,
      },
    });

    logDebug(`Whirlpool: pool update emitido — cache ahora: ${marketState.getPoolCount()} pools, ${marketState.getPairCount()} pares`);
  }

  async getPoolPrice(poolAddress: string): Promise<{ price: number; liquidity: number } | null> {
    const cached = marketState.getPool(poolAddress);
    if (cached) {
      return {
        price: sqrtPriceX64ToPrice(BigInt(cached.sqrtPriceX64), cached.decimalsA, cached.decimalsB),
        liquidity: Number(cached.liquidity),
      };
    }
    const poolEntry = POOL_REGISTRY.find((p) => p.address === poolAddress);
    try {
      const acc = await this.connection.getAccountInfo(new PublicKey(poolAddress));
      if (!acc || acc.data.length < 150) return null;

      const vown = await verifyOwner(this.connection, poolAddress, WHIRLPOOL_PROGRAM);
      if (!vown.valid) return null;

      const p = parseWhirlpoolData(acc.data, poolAddress);
      if (!p) return null;
      this.emitPoolUpdate(p, 0);
      const dA = poolEntry?.decimalsA ?? 9;
      const dB = poolEntry?.decimalsB ?? 6;
      return { price: sqrtPriceX64ToPrice(p.sqrtPrice, dA, dB), liquidity: Number(p.liquidity) };
    } catch { return null; }
  }

  async getPoolConfig(poolAddress: string): Promise<PoolConfig | null> {
    const poolEntry = POOL_REGISTRY.find((p) => p.address === poolAddress);
    try {
      const acc = await this.connection.getAccountInfo(new PublicKey(poolAddress));
      if (!acc || acc.data.length < 150) return null;
      const p = parseWhirlpoolData(acc.data, poolAddress);
      if (!p) return null;
      const mintA = poolEntry?.mintA || p.mintA;
      const mintB = poolEntry?.mintB || p.mintB;
      const dA = poolEntry?.decimalsA ?? 9;
      const dB = poolEntry?.decimalsB ?? 6;
      const fee = poolEntry?.feeBps ?? p.fee;
      const tickSpacing = poolEntry?.tickSpacing ?? p.tickSpacing;
      return { address: poolAddress, dex: this.dexName, poolType: "clmm", mintA, mintB, decimalsA: dA, decimalsB: dB, fee, tickSpacing };
    } catch { return null; }
  }

  getTrackedPools(): string[] { return [...this.trackedPools]; }

  scheduleRecovery(): void {
    this.setState("DEGRADED");
    this.failureCount++;
    if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
    this.recoveryTimer = setTimeout(async () => {
      this.setState("CONNECTED");
      const ok = await this.start();
      if (ok) {
        logInfo(`Whirlpool: recuperado tras ${this.failureCount} fallos`);
        for (const p of this.trackedPools) await this.trackPool(p).catch(() => {});
      }
    }, Math.min(60000, 5000 * Math.pow(2, this.failureCount)));
  }

  checkHealth(): void {
    const now = Date.now();
    if (this.state === "HEALTHY" || this.state === "RECEIVING_DATA") {
      if (now - this.lastUpdate > 30000) {
        logWarning(`Whirlpool: sin updates por ${(now - this.lastUpdate) / 1000}s — degradando`);
        this.setState("DEGRADED");
      }
    }
    if (this.state === "DEGRADED" && this.lastUpdate > 0 && now - this.lastUpdate < 15000) {
      this.setState("RECEIVING_DATA");
    }
  }

  destroy(): void {
    if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
    this.trackedPools = [];
    this.setState("SHUTDOWN");
    logInfo("Whirlpool: provider detenido correctamente (SHUTDOWN)");
  }
}
