import { POOL_REGISTRY, PoolRegistryEntry } from "../config/pools";
import { WebSocketManager } from "../ws";
import { marketState } from "../market";
import { priceGraph, MarketSurfaceEntry } from "../graph";
import { logInfo, logSuccess, logWarning } from "../logger";

export type DataSource = "WS_ACTIVE" | "RPC_FALLBACK" | "STALE" | "DEGRADED";

export interface PoolHealth {
  pair: string;
  poolAddress: string;
  dex: string;
  wsConnected: boolean;
  wsUpdateCount: number;
  wsLastUpdate: number;
  parserOk: boolean;
  hasUpdates: boolean;
  updateCount: number;
  lastUpdateAge: number;
  graphStatus: "INSERTED" | "PENDING" | "REJECTED" | "STALE" | "NO_DATA";
  edgeHealth: string;
  price: number;
  liquidity: number;
  dataSource: DataSource;
}

const MAX_STALE_AGE_MS = 30000;

export class PoolHealthMonitor {
  private wsManager: WebSocketManager | null = null;
  private pools: PoolRegistryEntry[] = [];
  private lastResubscribe: Map<string, number> = new Map();
  private readonly RESUBSCRIBE_COOLDOWN_MS = 30000;

  attachWs(wsManager: WebSocketManager): void {
    this.wsManager = wsManager;
  }

  getHealth(): PoolHealth[] {
    const results: PoolHealth[] = [];
    const now = Date.now();

    for (const entry of POOL_REGISTRY) {
      const poolAddr = entry.address;
      const poolSnapshot = marketState.getPool(poolAddr);
      const hasUpdates = poolSnapshot !== undefined;
      const updateCount = hasUpdates ? 1 : 0;
      const lastUpdateAge = hasUpdates ? now - poolSnapshot!.timestamp : -1;

      const wsKey = `account:${poolAddr}`;
      const wsUpdateCount = this.wsManager?.getSubscriptionUpdateCount(wsKey) ?? 0;
      const wsLastUpdate = this.wsManager?.getLastUpdateTime(wsKey) ?? 0;
      const wsConnected = wsLastUpdate > 0 && (now - wsLastUpdate) < MAX_STALE_AGE_MS * 2;

      const surface = priceGraph.getMarketSurface(entry.pair);
      const poolInSurface = surface
        ? surface.pools.find((p: MarketSurfaceEntry) => p.poolAddress === poolAddr)
        : undefined;

      let graphStatus: PoolHealth["graphStatus"] = "PENDING";
      let edgeHealth = "";
      let price = 0;
      let liquidity = 0;
      if (poolInSurface) {
        price = poolInSurface.price;
        liquidity = poolInSurface.liquidity;
        edgeHealth = poolInSurface.health;
        if (poolInSurface.health === "VALID") {
          graphStatus = "INSERTED";
        } else if (poolInSurface.health === "STALE") {
          graphStatus = "STALE";
        } else {
          graphStatus = "REJECTED";
        }
      }

      // Determine data source freshness
      let dataSource: DataSource = "DEGRADED";
      if (wsConnected && wsUpdateCount > 0) {
        dataSource = "WS_ACTIVE";
      } else if (hasUpdates && lastUpdateAge < MAX_STALE_AGE_MS * 3) {
        dataSource = hasUpdates ? "RPC_FALLBACK" : "DEGRADED";
      } else if (lastUpdateAge < MAX_STALE_AGE_MS) {
        dataSource = "RPC_FALLBACK";
      } else if (hasUpdates) {
        dataSource = "STALE";
      } else {
        dataSource = "DEGRADED";
      }

      results.push({
        pair: entry.pair,
        poolAddress: poolAddr,
        dex: entry.dex,
        wsConnected,
        wsUpdateCount,
        wsLastUpdate: wsLastUpdate || 0,
        parserOk: wsUpdateCount > 0 || !this.wsManager,
        hasUpdates,
        updateCount,
        lastUpdateAge,
        graphStatus,
        edgeHealth,
        price,
        liquidity,
        dataSource,
      });
    }

    return results;
  }

  checkStaleSubscriptions(): PoolHealth[] {
    if (!this.wsManager) return [];
    const health = this.getHealth();
    const stale: PoolHealth[] = [];
    const now = Date.now();

    for (const h of health) {
      const wsLastUpdate = h.wsLastUpdate;
      if (wsLastUpdate > 0 && (now - wsLastUpdate) > MAX_STALE_AGE_MS) {
        stale.push(h);
      }
    }

    return stale;
  }

  async resubscribeStale(): Promise<number> {
    if (!this.wsManager) return 0;
    const stale = this.checkStaleSubscriptions();
    const now = Date.now();
    let count = 0;

    for (const s of stale) {
      const lastResub = this.lastResubscribe.get(s.poolAddress) || 0;
      if (now - lastResub < this.RESUBSCRIBE_COOLDOWN_MS) continue;

      logWarning(`PoolHealth: pool ${s.poolAddress.substring(0, 8)}... (${s.pair} ${s.dex}) — stale (${((now - s.wsLastUpdate) / 1000).toFixed(1)}s sin updates) — resubscribiendo`);
      this.wsManager.unsubscribeAccount(s.poolAddress);

      const entry = POOL_REGISTRY.find((p) => p.address === s.poolAddress);
      if (entry) {
        const isWhirlpool = entry.dex === "Whirlpool";
        if (isWhirlpool) {
          this.wsManager.subscribeAccount(s.poolAddress, (data, slot) => {
            if (!data || data.length < 85) return;
            const liqLow = data.readBigUInt64LE(49);
            const liqHigh = data.readBigUInt64LE(57);
            const liquidity = (liqHigh << 64n) | liqLow;
            const sqrtLow = data.readBigUInt64LE(65);
            const sqrtHigh = data.readBigUInt64LE(73);
            const sqrtPrice = (sqrtHigh << 64n) | sqrtLow;
            const tick = data.readInt32LE(81);
            if (sqrtPrice > 0n) {
              const snapshot: import("../market/state-cache").PoolStateSnapshot = {
                poolAddress: entry.address,
                dex: entry.dex,
                mintA: entry.mintA,
                mintB: entry.mintB,
                decimalsA: entry.decimalsA,
                decimalsB: entry.decimalsB,
                sqrtPriceX64: sqrtPrice.toString(),
                liquidity: liquidity.toString(),
                tick,
                fee: entry.feeBps,
                slot,
                timestamp: Date.now(),
                dataQuality: "VALID",
                source: "ON_CHAIN_VALIDATED" as const,
              };
              marketState.updatePool(snapshot);
              const pool = marketState.getPool(entry.address);
              if (pool) priceGraph.updateFromPool(pool);
            }
          }, "confirmed");
        }
      }

      this.lastResubscribe.set(s.poolAddress, now);
      count++;
    }

    return count;
  }

  printPoolHealthPanel(): void {
    const health = this.getHealth();
    const now = Date.now();

    logSuccess("═══════════════════════════════════════════════");
    logSuccess("🔍 POOL HEALTH MONITOR");
    logSuccess("═══════════════════════════════════════════════");

    for (const h of health) {
      const wsIcon = h.wsConnected ? "🟢" : h.wsUpdateCount > 0 ? "🟡" : "🔴";
      const parserIcon = h.parserOk ? "🟢" : "🔴";
      const graphIcon = h.graphStatus === "INSERTED" ? "🟢" :
        h.graphStatus === "PENDING" ? "🟡" :
        h.graphStatus === "STALE" ? "🟤" : "🔴";
      const ageStr = h.lastUpdateAge >= 0 ? `${(h.lastUpdateAge / 1000).toFixed(1)}s` : "never";
      const wsAgeStr = h.wsLastUpdate > 0 ? `${((now - h.wsLastUpdate) / 1000).toFixed(1)}s` : "n/a";

      const dsIcon = h.dataSource === "WS_ACTIVE" ? "🟢" :
        h.dataSource === "RPC_FALLBACK" ? "🟡" :
        h.dataSource === "STALE" ? "🟤" : "🔴";

      logSuccess(`  ┌─ ${h.pair} (${h.poolAddress.substring(0, 8)}...) ───────────────`);
      logInfo(`  │  DEX:    ${h.dex}`);
      logInfo(`  │  Data:   ${dsIcon} ${h.dataSource}${h.dataSource === "WS_ACTIVE" ? ` (WS ${wsAgeStr} ago)` : h.dataSource === "RPC_FALLBACK" ? ` (RPC ${ageStr} ago)` : ""}`);
      logInfo(`  │  Parser: ${parserIcon} (${h.hasUpdates ? "data received" : "no data"})`);
      logInfo(`  │  Graph:  ${graphIcon} ${h.graphStatus}${h.edgeHealth ? ` (${h.edgeHealth})` : ""}`);
      logInfo(`  │  Cache:  ${h.updateCount}x  age=${ageStr}`);
      if (h.price > 0) {
        logInfo(`  │  Price:  $${h.price.toFixed(6)}  liq: ${h.liquidity >= 1_000_000 ? `${(h.liquidity / 1_000_000).toFixed(1)}M` : h.liquidity.toFixed(0)}`);
      }
      logSuccess(`  └──────────────────────────────────────────`);
    }
  }
}

export const poolHealthMonitor = new PoolHealthMonitor();
