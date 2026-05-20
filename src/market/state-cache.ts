import { logDebug, logWarning, logInfo, logSuccess } from "../logger";
import { POOL_REGISTRY } from "../config/pools";

export type DataQuality = "VALID" | "SUSPECT" | "CORRUPTED";

export interface PoolStateSnapshot {
  poolAddress: string;
  dex: string;
  mintA: string;
  mintB: string;
  decimalsA: number;
  decimalsB: number;
  sqrtPriceX64: string;
  liquidity: string;
  tick: number;
  fee: number;
  slot: number;
  timestamp: number;
  dataQuality: DataQuality;
  source: "ON_CHAIN_VALIDATED" | "FALLBACK" | "STALE" | "INVALID";
}

export interface PairState {
  label: string;
  mintA: string;
  mintB: string;
  poolAddress: string;
  dex: string;
  spotPrice: number;
  lastUpdate: number;
  updateCount: number;
  firstUpdateTime: number;
  lastSqrtPrice: string;
  lastLiquidity: string;
  lastTick: number;
  lastSlot: number;
}

export class MarketStateCache {
  private pools = new Map<string, PoolStateSnapshot>();
  private pairs = new Map<string, PairState>();
  private readonly MAX_POOL_AGE_MS = 120_000;
  private readonly MAX_PAIRS = 50;
  private totalUpdates = 0;
  private startTime = Date.now();
  private slotWarnings = 0;
  private stalePoolCleanups = 0;
  private mintOrderMap = new Map<string, { onChainMintA: string; onChainMintB: string }>();
  private invalidPools = new Set<string>(); // pools blacklisted after repeated failures
  private poolStrikes = new Map<string, number>(); // pool address → consecutive invalid updates
  private readonly MAX_STRIKES = 5;
  private disabledPools = new Set<string>(); // pools disabled after MAX_STRIKES

  /** Record an invalid update for a pool (consecutive failures) */
  recordInvalidUpdate(address: string): void {
    const strikes = (this.poolStrikes.get(address) || 0) + 1;
    this.poolStrikes.set(address, strikes);
    if (strikes >= this.MAX_STRIKES) {
      this.disabledPools.add(address);
      this.invalidPools.add(address);
      logInfo(`POOL_DISABLED: ${address.substring(0, 8)}... invalid ${strikes} consecutive times`);
    }
  }

  /** Record a successful update (reset strikes) */
  recordValidUpdate(address: string): void {
    this.poolStrikes.delete(address);
  }

  /** Auto-disable pools that have been stale for too long */
  autoDisableStalePools(maxAgeMs = 300_000): number {
    const now = Date.now();
    let disabled = 0;
    for (const [addr, pool] of this.pools) {
      if (now - pool.timestamp > maxAgeMs && !this.disabledPools.has(addr)) {
        this.disabledPools.add(addr);
        this.invalidPools.add(addr);
        disabled++;
        logInfo(`POOL_AUTO_DISABLED: ${addr.substring(0, 8)}... stale for ${((now - pool.timestamp) / 1000).toFixed(0)}s`);
      }
    }
    return disabled;
  }

  isDisabled(address: string): boolean {
    return this.disabledPools.has(address);
  }

  getDisabledCount(): number {
    return this.disabledPools.size;
  }

  getDisabledPools(): string[] {
    return Array.from(this.disabledPools);
  }

  private knownMints: Record<string, string> = {
    "So11111111111111111111111111111111111111112": "SOL",
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": "USDC",
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": "USDT",
    "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN": "JUP",
    "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": "BONK",
    "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm": "WIF",
    "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": "RAY",
    "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr": "POPCAT",
    "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3": "PYTH",
    "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So": "mSOL",
    "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn": "jitoSOL",
  };
  private symbolToMint: Record<string, string> = {};

  constructor() {
    for (const [mint, sym] of Object.entries(this.knownMints)) {
      this.symbolToMint[sym] = mint;
    }
  }

  registerPoolFromRegistry(address: string, mintA: string, mintB: string, dex: string, decimalsA: number, decimalsB: number): void {
    const label = this.buildPairLabel(mintA, mintB);
    if (!label) {
      logWarning(`StateCache: no se pudo crear pair para pool ${address.substring(0, 12)}... — mints: ${mintA.substring(0, 8)}.., ${mintB.substring(0, 8)}..`);
      return;
    }

    if (!this.pairs.has(label)) {
      const pair: PairState = {
        label,
        mintA,
        mintB,
        poolAddress: address,
        dex,
        spotPrice: 0,
        lastUpdate: 0,
        updateCount: 0,
        firstUpdateTime: 0,
        lastSqrtPrice: "0",
        lastLiquidity: "0",
        lastTick: 0,
        lastSlot: 0,
      };
      this.pairs.set(label, pair);
      logDebug(`StateCache: pair creado desde registry: ${label} (${dex})`);
    }
  }

  recordMintOrder(poolAddress: string, onChainMintA: string, onChainMintB: string): void {
    this.mintOrderMap.set(poolAddress, { onChainMintA, onChainMintB });
    const registryEntry = POOL_REGISTRY.find((p) => p.address === poolAddress);
    if (registryEntry && (registryEntry.mintA !== onChainMintA || registryEntry.mintB !== onChainMintB)) {
      logInfo(`StateCache: pool ${poolAddress.substring(0, 8)}... mint ordering invertido — registry(SOL/USDC) vs on-chain(${onChainMintA.substring(0, 4)}../${onChainMintB.substring(0, 4)}..) — price se invertirá automáticamente`);
    }
  }

  isPoolInverted(poolAddress: string): boolean {
    const order = this.mintOrderMap.get(poolAddress);
    if (!order) return false;
    const registryEntry = POOL_REGISTRY.find((p) => p.address === poolAddress);
    if (!registryEntry) return false;
    return registryEntry.mintA !== order.onChainMintA || registryEntry.mintB !== order.onChainMintB;
  }

  static isValidPoolData(snapshot: PoolStateSnapshot): boolean {
    try {
      if (snapshot.dataQuality === "CORRUPTED" || snapshot.dataQuality === "SUSPECT") return false;
      if (snapshot.source === "INVALID") return false;

      const sqrtPrice = BigInt(snapshot.sqrtPriceX64);
      if (sqrtPrice <= 0n) return false;

      const sqrtNum = Number(sqrtPrice);
      if (!isFinite(sqrtNum) || sqrtNum <= 0) return false;

      const sqrtApprox = sqrtNum / 2 ** 64;
      if (sqrtApprox > 1e10 || (sqrtApprox > 0 && sqrtApprox < 1e-8)) {
        logDebug(`isValidPoolData [${snapshot.poolAddress.substring(0, 8)}]: sqrtPriceQ64 fuera de rango (≈${sqrtApprox.toExponential(2)})`);
        return false;
      }

      if (snapshot.tick < -500000 || snapshot.tick > 500000) {
        logDebug(`isValidPoolData [${snapshot.poolAddress.substring(0, 8)}]: tick ${snapshot.tick} fuera de rango`);
        return false;
      }

      if (snapshot.liquidity === "0") return false;

      const liqNum = Number(snapshot.liquidity);
      if (!isFinite(liqNum) || liqNum > 1e18) {
        logDebug(`isValidPoolData [${snapshot.poolAddress.substring(0, 8)}]: liquidity ${liqNum.toExponential(2)} absurda`);
        return false;
      }

      // Always validate computed spot price regardless of dataQuality
      const spotPrice = Math.pow(sqrtApprox, 2) * Math.pow(10, snapshot.decimalsA - snapshot.decimalsB);
      if (!isFinite(spotPrice) || spotPrice <= 0) {
        logDebug(`isValidPoolData [${snapshot.poolAddress.substring(0, 8)}]: spotPrice ${spotPrice} inválida`);
        return false;
      }
      if (spotPrice > 1e15) {
        logDebug(`isValidPoolData [${snapshot.poolAddress.substring(0, 8)}]: spotPrice ${spotPrice.toExponential(2)} fuera de rango`);
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  updatePool(snapshot: PoolStateSnapshot): void {
    if (snapshot.dataQuality !== "VALID") return;

    if (!MarketStateCache.isValidPoolData(snapshot)) {
      logDebug(`StateCache: isValidPoolData RECHAZÓ pool ${snapshot.poolAddress.substring(0, 8)}... — saltando`);
      return;
    }

    const existing = this.pools.get(snapshot.poolAddress);

    // ── Preserve last valid snapshot ──
    // If the new snapshot has zero price/liquidity but the existing one is valid, KEEP the old one
    if (existing && existing.sqrtPriceX64 !== "0" && existing.liquidity !== "0") {
      const newSqrt = BigInt(snapshot.sqrtPriceX64);
      const newLiq = BigInt(snapshot.liquidity);
      if (newSqrt <= 0n || newLiq <= 0n) {
        logDebug(`StateCache: preservando último snapshot válido para ${snapshot.poolAddress.substring(0, 8)}... — nuevo sqrt=${snapshot.sqrtPriceX64} liq=${snapshot.liquidity}`);
        return;
      }
    }

    if (snapshot.slot > 0 && existing && existing.slot > snapshot.slot) {
      this.slotWarnings++;
      if (this.slotWarnings <= 5) {
        logDebug(`Slot coherence [${snapshot.poolAddress.substring(0, 8)}]: ignorando slot ${snapshot.slot} < existing ${existing.slot}`);
      }
      return;
    }

    if (existing && existing.slot === snapshot.slot && existing.timestamp > snapshot.timestamp - 500) {
      return;
    }

    if (existing && existing.sqrtPriceX64 === snapshot.sqrtPriceX64 && existing.liquidity === snapshot.liquidity) {
      if (Date.now() - existing.timestamp < 2000) return;
    }

    this.pools.set(snapshot.poolAddress, snapshot);
    this.totalUpdates++;

    if (snapshot.dataQuality === "VALID") {
      this.updatePairState(snapshot);
    } else {
      logDebug(`StateCache: pool ${snapshot.poolAddress.substring(0, 8)}... actualizado con calidad ${snapshot.dataQuality} — pair NO actualizado`);
    }
  }

  private updatePairState(snapshot: PoolStateSnapshot): void {
    const label = this.buildPairLabel(snapshot.mintA, snapshot.mintB);
    if (!label) {
      logDebug(`StateCache: buildPairLabel falló para mints ${snapshot.mintA.substring(0, 8)}.. / ${snapshot.mintB.substring(0, 8)}.. — pair NO creado`);
      return;
    }

    let pair = this.pairs.get(label);
    if (!pair) {
      if (this.pairs.size >= this.MAX_PAIRS) return;
      pair = {
        label,
        mintA: snapshot.mintA,
        mintB: snapshot.mintB,
        poolAddress: snapshot.poolAddress,
        dex: snapshot.dex,
        spotPrice: 0,
        lastUpdate: 0,
        updateCount: 0,
        firstUpdateTime: Date.now(),
        lastSqrtPrice: "0",
        lastLiquidity: "0",
        lastTick: 0,
        lastSlot: 0,
      };
      this.pairs.set(label, pair);
      logInfo(`StateCache: pair ${label} creado desde update (dex: ${snapshot.dex})`);
    }

    const prevPrice = pair.spotPrice;
    const newPrice = this.calculateSpotPrice(snapshot);
    pair.spotPrice = newPrice;
    pair.lastUpdate = Date.now();
    pair.updateCount++;
    pair.lastSqrtPrice = snapshot.sqrtPriceX64;
    pair.lastLiquidity = snapshot.liquidity;
    pair.lastTick = snapshot.tick;
    pair.lastSlot = snapshot.slot;
    if (pair.firstUpdateTime === 0) pair.firstUpdateTime = Date.now();

    if (prevPrice > 0 && newPrice > 0) {
      const changePct = Math.abs(newPrice - prevPrice) / prevPrice * 100;
      if (changePct > 5) {
        logDebug(`Price change [${label}]: ${prevPrice.toFixed(4)} → ${newPrice.toFixed(4)} (${changePct.toFixed(1)}%) slot=${snapshot.slot}`);
      }
    }

    if (pair.updateCount === 1) {
      logSuccess(`StateCache: ✅ ${label} — update #1 recibido — price=$${newPrice.toFixed(4)} tick=${snapshot.tick} liq=${Number(snapshot.liquidity).toLocaleString()}`);
    }
  }

  private buildPairLabel(mintA: string, mintB: string): string | null {
    const symA = this.knownMints[mintA];
    const symB = this.knownMints[mintB];
    if (!symA || !symB) {
      logDebug(`buildPairLabel: mint no reconocido — A="${mintA.substring(0, 12)}..." (${symA || "?"}) B="${mintB.substring(0, 12)}..." (${symB || "?"})`);
      return null;
    }
    const priority = ["SOL", "USDC", "USDT", "JUP", "WIF", "RAY", "BONK", "POPCAT", "PYTH", "mSOL", "jitoSOL"];
    return priority.indexOf(symA) < priority.indexOf(symB) ? `${symA}/${symB}` : `${symB}/${symA}`;
  }

  private calculateSpotPrice(snapshot: PoolStateSnapshot): number {
    try {
      const sqrtPrice = BigInt(snapshot.sqrtPriceX64);
      const rawPrice = Number(sqrtPrice) / 2 ** 64;
      let spotPrice = rawPrice * rawPrice * Math.pow(10, snapshot.decimalsA - snapshot.decimalsB);
      if (spotPrice <= 0 || !isFinite(spotPrice)) {
        logDebug(`Spot price inválido: ${spotPrice} (raw=${rawPrice}, sqrt=${snapshot.sqrtPriceX64}, decimalsA=${snapshot.decimalsA}, decimalsB=${snapshot.decimalsB})`);
        return 0;
      }
      // Normalize price to canonical label direction (base/quote by priority)
      // raw price is always price(mintA in mintB), but the label may reorder mints
      const symA = this.knownMints[snapshot.mintA];
      const symB = this.knownMints[snapshot.mintB];
      if (symA && symB) {
        const priority = ["SOL", "USDC", "USDT", "JUP", "WIF", "RAY", "BONK", "POPCAT", "PYTH", "mSOL", "jitoSOL"];
        // If symB has higher priority than symA, label will be symB/symA,
        // but raw price is symA/symB → invert
        if (priority.indexOf(symB) < priority.indexOf(symA)) {
          spotPrice = 1 / spotPrice;
        }
      }
      return spotPrice;
    } catch (err) {
      logDebug(`Error calculando spot price: ${err}`);
      return 0;
    }
  }

  getPool(address: string): PoolStateSnapshot | undefined {
    const pool = this.pools.get(address);
    if (!pool) return undefined;
    if (Date.now() - pool.timestamp > this.MAX_POOL_AGE_MS) {
      this.pools.delete(address);
      this.stalePoolCleanups++;
      return undefined;
    }
    return pool;
  }

  getPair(label: string): PairState | undefined {
    return this.pairs.get(label);
  }

  getPoolCount(): number { return this.pools.size; }
  getPairCount(): number { return this.pairs.size; }
  getTotalUpdates(): number { return this.totalUpdates; }
  getUptimeMs(): number { return Date.now() - this.startTime; }

  getPairsByAge(): Array<{ label: string; age: number; slots: number }> {
    return Array.from(this.pairs.entries())
      .map(([label, p]) => ({ label, age: Date.now() - p.lastUpdate, slots: p.updateCount }))
      .sort((a, b) => a.age - b.age);
  }

  getPoolsForPair(label: string): PoolStateSnapshot[] {
    const pair = this.pairs.get(label);
    if (!pair) return [];
    return Array.from(this.pools.values()).filter(
      (p) => Date.now() - p.timestamp <= this.MAX_POOL_AGE_MS &&
        this.buildPairLabel(p.mintA, p.mintB) === label
    );
  }

  getAllPools(): PoolStateSnapshot[] {
    const now = Date.now();
    return Array.from(this.pools.values()).filter((p) => now - p.timestamp <= this.MAX_POOL_AGE_MS);
  }

  getActiveDexes(): string[] {
    return [...new Set(this.getAllPools().map((p) => p.dex))];
  }

  cleanup(): void {
    const now = Date.now();
    let removed = 0;
    for (const [addr, pool] of this.pools) {
      if (now - pool.timestamp > this.MAX_POOL_AGE_MS) {
        this.pools.delete(addr);
        removed++;
      }
    }
    for (const [label, pair] of this.pairs) {
      if (pair.lastUpdate > 0 && now - pair.lastUpdate > this.MAX_POOL_AGE_MS) {
        logDebug(`StateCache: pair ${label} stale — ${(now - pair.lastUpdate) / 1000}s sin updates`);
      }
    }
    if (removed > 0) {
      this.stalePoolCleanups += removed;
    }
  }

  /** Add a pool to the blacklist (repeated failures) */
  blacklistPool(address: string, reason: string): void {
    this.invalidPools.add(address);
    this.pools.delete(address);
    logInfo(`StateCache: pool ${address.substring(0, 8)}... blacklisted — ${reason}`);
  }

  isBlacklisted(address: string): boolean {
    return this.invalidPools.has(address);
  }

  getBlacklistedCount(): number {
    return this.invalidPools.size;
  }

  getBlacklistedPools(): string[] {
    return Array.from(this.invalidPools);
  }

  getStats(): { pools: number; pairs: number; updates: number; uptime: number; slotWarnings: number; staleCleanups: number; blacklisted: number; disabled: number; pairDetails: Array<{ label: string; updates: number; price: number; age: number }> } {
    return {
      pools: this.pools.size,
      pairs: this.pairs.size,
      updates: this.totalUpdates,
      uptime: Date.now() - this.startTime,
      slotWarnings: this.slotWarnings,
      staleCleanups: this.stalePoolCleanups,
      blacklisted: this.invalidPools.size,
      disabled: this.disabledPools.size,
      pairDetails: Array.from(this.pairs.values()).map((p) => ({
        label: p.label,
        updates: p.updateCount,
        price: p.spotPrice,
        age: p.lastUpdate > 0 ? Date.now() - p.lastUpdate : -1,
      })),
    };
  }

  clear(): void {
    this.pools.clear();
    this.pairs.clear();
    this.totalUpdates = 0;
    this.startTime = Date.now();
    this.slotWarnings = 0;
    this.stalePoolCleanups = 0;
  }
}

export const marketState = new MarketStateCache();
