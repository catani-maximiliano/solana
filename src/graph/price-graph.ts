import { sqrtPriceX64ToPrice } from "../math";
import { marketState, PoolStateSnapshot } from "../market/state-cache";
import { logDebug, logSuccess, logWarning, logInfo } from "../logger";

export type EdgeHealth = "VALID" | "STALE" | "INVALID" | "LOW_LIQUIDITY" | "CORRUPTED";

export interface PriceNode {
  token: string;
  symbol: string;
  totalLiquidity: number;
  poolCount: number;
}

export interface PriceEdge {
  from: string;
  to: string;
  dex: string;
  poolAddress: string;
  price: number;
  inversePrice: number;
  liquidity: number;
  fee: number;
  weight: number;
  slot: number;
  timestamp: number;
  health: EdgeHealth;
  source: "seed" | "ws_direct" | "provider" | "fallback";
}

export interface MarketSurfaceEntry {
  poolAddress: string;
  dex: string;
  price: number;
  liquidity: number;
  fee: number;
  health: EdgeHealth;
  age: number;
  slot: number;
  decimalsA: number;
  decimalsB: number;
  sqrtPriceX64: string;
}

export interface MarketSurface {
  pair: string;
  symbolA: string;
  symbolB: string;
  pools: MarketSurfaceEntry[];
  validCount: number;
  totalCount: number;
  bestBid: number;
  bestAsk: number;
  spreadRange: number;
}

function validatePoolPrice(price: number, liquidity: number, tick: number): EdgeHealth {
  if (!isFinite(price) || price <= 0) return "CORRUPTED";
  if (price < 0.0001 || price > 1_000_000) return "CORRUPTED";
  if (tick < -500000 || tick > 500000) return "CORRUPTED";
  if (!isFinite(liquidity) || liquidity < 0) return "CORRUPTED";
  if (liquidity === 0) return "LOW_LIQUIDITY";
  if (liquidity < 1_000) return "LOW_LIQUIDITY";
  return "VALID";
}

const VALID_EDGE_CACHE_TTL = 30_000;

export class PriceGraph {
  private nodes = new Map<string, PriceNode>();
  private edges = new Map<string, PriceEdge[]>();

  updateFromPool(snapshot: PoolStateSnapshot): void {
    if (snapshot.dataQuality === "CORRUPTED" || snapshot.dataQuality === "SUSPECT") {
      logWarning(`Graph: pool ${snapshot.poolAddress.substring(0, 8)}... calidad ${snapshot.dataQuality} — SALTANDO`);
      return;
    }

    const isInverted = marketState.isPoolInverted(snapshot.poolAddress);
    let price: number;
    if (isInverted) {
      const raw = sqrtPriceX64ToPrice(BigInt(snapshot.sqrtPriceX64), snapshot.decimalsA, snapshot.decimalsB);
      price = raw > 0 ? 1 / raw : 0;
    } else {
      price = sqrtPriceX64ToPrice(BigInt(snapshot.sqrtPriceX64), snapshot.decimalsA, snapshot.decimalsB);
    }

    const liquidity = Number(snapshot.liquidity) || 0;
    const health = validatePoolPrice(price, liquidity, snapshot.tick);
    const symA = this.mintToSymbol(snapshot.mintA);
    const symB = this.mintToSymbol(snapshot.mintB);

    if (health === "CORRUPTED") {
      logWarning(`Graph: ❌ pool ${snapshot.poolAddress.substring(0, 8)}... (${snapshot.dex}) price=${price} liq=${liquidity} tick=${snapshot.tick} — CORRUPTED, NO agregando edge`);
      const existingEdge = this.findEdge(snapshot.mintA, snapshot.mintB, snapshot.poolAddress);
      if (existingEdge) {
        existingEdge.health = "CORRUPTED";
        existingEdge.timestamp = Date.now();
        logInfo(`Graph: ⚡ edge CORRUPTED para ${symA}/${symB} — pool ${snapshot.poolAddress.substring(0, 8)}... asilado`);
      }
      this.updateNodeLiquidity(snapshot.mintA, snapshot.mintB);
      return;
    }

    const nodeA = this.ensureNode(snapshot.mintA, symA);
    const nodeB = this.ensureNode(snapshot.mintB, symB);

    const edgeAB: PriceEdge = {
      from: snapshot.mintA, to: snapshot.mintB,
      dex: snapshot.dex, poolAddress: snapshot.poolAddress,
      price, inversePrice: price > 0 ? 1 / price : 0,
      liquidity, fee: snapshot.fee,
      weight: Math.min(1, liquidity / 1_000_000),
      slot: snapshot.slot, timestamp: Date.now(),
      health, source: snapshot.source === "ON_CHAIN_VALIDATED" ? "provider" : "ws_direct",
    };
    const edgeBA: PriceEdge = {
      from: snapshot.mintB, to: snapshot.mintA,
      dex: snapshot.dex, poolAddress: snapshot.poolAddress,
      price: edgeAB.inversePrice, inversePrice: price,
      liquidity, fee: snapshot.fee,
      weight: edgeAB.weight,
      slot: snapshot.slot, timestamp: Date.now(),
      health, source: edgeAB.source,
    };

    this.addEdge(edgeAB);
    this.addEdge(edgeBA);

    this.updateNodeLiquidity(snapshot.mintA, snapshot.mintB);

    const edgeCount = this.edges.get(`${snapshot.mintA}:${snapshot.mintB}`)?.length || 0;
    const logMsg = `Graph: ${symA}/${symB} → ${snapshot.dex} price=$${price.toFixed(6)} liq=${(liquidity / 1_000_000).toFixed(1)}M tick=${snapshot.tick} slot=${snapshot.slot} health=${health} (${edgeCount} edges total)`;
    if (health === "VALID") {
      logSuccess(`✅ ${logMsg}`);
    } else {
      logWarning(`⚠️  ${logMsg}`);
    }
  }

  seedFromRegistry(poolAddress: string, mintA: string, mintB: string, dex: string): void {
    const symA = this.mintToSymbol(mintA);
    const symB = this.mintToSymbol(mintB);

    this.ensureNode(mintA, symA);
    this.ensureNode(mintB, symB);

    const edgeAB: PriceEdge = {
      from: mintA, to: mintB, dex, poolAddress,
      price: 0, inversePrice: 0, liquidity: 0, fee: 0, weight: 0,
      slot: 0, timestamp: Date.now(),
      health: "INVALID", source: "seed",
    };
    const edgeBA: PriceEdge = {
      from: mintB, to: mintA, dex, poolAddress,
      price: 0, inversePrice: 0, liquidity: 0, fee: 0, weight: 0,
      slot: 0, timestamp: Date.now(),
      health: "INVALID", source: "seed",
    };
    this.addEdge(edgeAB);
    this.addEdge(edgeBA);

    logSuccess(`Graph: seeded ${symA}/${symB} (${dex}) — ${this.nodes.size} nodes, ${this.getEdgeCount()} edges total`);
  }

  private ensureNode(token: string, symbol: string): PriceNode {
    const existing = this.nodes.get(token);
    if (existing) return existing;
    const node: PriceNode = { token, symbol, totalLiquidity: 0, poolCount: 0 };
    this.nodes.set(token, node);
    return node;
  }

  private updateNodeLiquidity(mintA: string, mintB: string): void {
    for (const mint of [mintA, mintB]) {
      const node = this.nodes.get(mint);
      if (!node) continue;
      let totalLiq = 0;
      let poolCount = 0;
      for (const [, edgeList] of this.edges) {
        for (const e of edgeList) {
          if (e.from === mint && e.health === "VALID") {
            totalLiq += e.liquidity;
            poolCount++;
          }
        }
      }
      node.totalLiquidity = totalLiq;
      node.poolCount = poolCount;
    }
  }

  private findEdge(from: string, to: string, poolAddress: string): PriceEdge | undefined {
    const key = `${from}:${to}`;
    const existing = this.edges.get(key);
    return existing?.find((e) => e.poolAddress === poolAddress);
  }

  addEdge(edge: PriceEdge): void {
    const key = `${edge.from}:${edge.to}`;
    const existing = this.edges.get(key) || [];
    const idx = existing.findIndex((e) => e.poolAddress === edge.poolAddress);
    if (idx >= 0) existing[idx] = edge;
    else existing.push(edge);
    this.edges.set(key, existing);
    const symFrom = this.mintToSymbol(edge.from);
    const symTo = this.mintToSymbol(edge.to);
    logDebug(`Graph edge: ${symFrom}→${symTo} (${edge.dex}) ${idx >= 0 ? "updated" : "inserted"} price=${edge.price} health=${edge.health} (${existing.length} edges for pair)`);
  }

  getAllEdgesForKey(from: string, to: string): PriceEdge[] {
    const key = `${from}:${to}`;
    return this.edges.get(key)?.filter((e) => e.health === "VALID") || [];
  }

  getDirectPrice(from: string, to: string): PriceEdge | null {
    const key = `${from}:${to}`;
    const edges = this.edges.get(key);
    if (!edges || edges.length === 0) return null;
    const valid = edges.filter((e) => e.health === "VALID");
    if (valid.length === 0) return null;
    return valid.reduce((best, e) => e.liquidity > best.liquidity ? e : best);
  }

  getMarketSurface(label: string): MarketSurface | null {
    const edgesForPair: PriceEdge[] = [];
    for (const [, edgeList] of this.edges) {
      edgesForPair.push(...edgeList);
    }
    const surfaceEdges = edgesForPair.filter((e) => {
      const symFrom = this.mintToSymbol(e.from);
      const symTo = this.mintToSymbol(e.to);
      const edgeLabel = `${symFrom}/${symTo}`;
      return edgeLabel === label || `${symTo}/${symFrom}` === label;
    });
    if (surfaceEdges.length === 0) return null;

    const poolMap = new Map<string, MarketSurfaceEntry>();
    for (const e of surfaceEdges) {
      const key = `${e.poolAddress}:${e.from}:${e.to}`;
      if (!poolMap.has(key)) {
        const poolData = marketState.getPool(e.poolAddress);
        poolMap.set(key, {
          poolAddress: e.poolAddress,
          dex: e.dex,
          price: e.price > 0 ? e.price : (e.inversePrice > 0 ? 1 / e.inversePrice : 0),
          liquidity: e.liquidity,
          fee: e.fee,
          health: e.health,
          age: Date.now() - e.timestamp,
          slot: e.slot,
          decimalsA: poolData?.decimalsA ?? 0,
          decimalsB: poolData?.decimalsB ?? 0,
          sqrtPriceX64: poolData?.sqrtPriceX64 ?? "0",
        });
      }
    }

    const pools = Array.from(poolMap.values());
    const valid = pools.filter((p) => p.health === "VALID" && p.price > 0);
    const prices = valid.map((p) => p.price).sort((a, b) => a - b);

    return {
      pair: label,
      symbolA: label.split("/")[0],
      symbolB: label.split("/")[1],
      pools,
      validCount: valid.length,
      totalCount: pools.length,
      bestBid: prices.length > 0 ? prices[0] : 0,
      bestAsk: prices.length > 0 ? prices[prices.length - 1] : 0,
      spreadRange: prices.length >= 2 ? ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100 : 0,
    };
  }

  getMultiPoolSpread(label: string): { exists: boolean; pools: number; validPools: number; spreadPct: number; dexes: string[] } {
    const surface = this.getMarketSurface(label);
    if (!surface || surface.validCount < 2) {
      return { exists: false, pools: surface?.totalCount || 0, validPools: surface?.validCount || 0, spreadPct: 0, dexes: [] };
    }
    const dexes = [...new Set(surface.pools.filter((p) => p.health === "VALID").map((p) => p.dex))];
    return {
      exists: true,
      pools: surface.totalCount,
      validPools: surface.validCount,
      spreadPct: surface.spreadRange,
      dexes,
    };
  }

  getArbitragePaths(from: string, maxHops: number = 3): Array<{ path: string[]; edge: PriceEdge[]; profit: number }> {
    const results: Array<{ path: string[]; edge: PriceEdge[]; profit: number }> = [];
    const visited = new Set<string>();

    const dfs = (current: string, path: string[], edges: PriceEdge[], depth: number) => {
      if (depth > maxHops) return;
      if (depth > 1 && current === from) {
        let price = 1;
        for (const e of edges) price *= e.price;
        const profit = (price - 1) * 100;
        if (profit > 0.01) results.push({ path: [...path], edge: [...edges], profit });
        return;
      }
      if (visited.has(current) && current !== from) return;

      visited.add(current);
      for (const [key, edgeList] of this.edges) {
        const [src] = key.split(":");
        if (src !== current) continue;
        const valid = edgeList.filter((e) => e.health === "VALID");
        if (valid.length === 0) continue;
        const bestEdge = valid.reduce((b, e) => e.liquidity > b.liquidity ? e : b);
        const dst = key.split(":")[1];
        path.push(dst);
        edges.push(bestEdge);
        dfs(dst, path, edges, depth + 1);
        path.pop();
        edges.pop();
      }
      if (current !== from) visited.delete(current);
    };

    dfs(from, [from], [], 0);
    return results.sort((a, b) => b.profit - a.profit);
  }

  getTriangularOpportunities(): Array<{
    route: string[];
    symbols: string[];
    spreadPct: number;
    profitUsd: number;
    hops: number;
  }> {
    const results: Array<{ route: string[]; symbols: string[]; spreadPct: number; profitUsd: number; hops: number }> = [];
    const tokens = Array.from(this.nodes.keys());
    const processed = new Set<string>();

    for (const token of tokens) {
      const paths = this.getArbitragePaths(token, 3);
      for (const p of paths) {
        if (p.path.length < 2) continue;
        const key = p.path.sort().join("-");
        if (processed.has(key)) continue;
        processed.add(key);
        const symbols = p.path.map((t) => this.mintToSymbol(t));
        results.push({
          route: p.path,
          symbols,
          spreadPct: p.profit,
          profitUsd: p.profit * 0.1,
          hops: p.path.length,
        });
      }
    }
    return results.sort((a, b) => b.spreadPct - a.spreadPct).slice(0, 20);
  }

  printMarketSurface(label: string): void {
    const surface = this.getMarketSurface(label);
    if (!surface) {
      logInfo(`Surface ${label}: sin datos`);
      return;
    }
    logSuccess(`========== MARKET SURFACE: ${label} ==========`);
    logInfo(`${surface.totalCount} pools (${surface.validCount} válidos) | bid: $${surface.bestBid.toFixed(4)} | ask: $${surface.bestAsk.toFixed(4)} | spread: ${surface.spreadRange.toFixed(4)}%`);
    for (const pool of surface.pools) {
      const healthIcon = pool.health === "VALID" ? "✅" : pool.health === "LOW_LIQUIDITY" ? "⚠️" : "❌";
      logInfo(`  ${healthIcon} ${pool.dex} | $${pool.price.toFixed(6)} | liq: ${(pool.liquidity / 1_000_000).toFixed(1)}M | fee: ${pool.fee}bps | age: ${(pool.age / 1000).toFixed(1)}s | health: ${pool.health}`);
    }
    logSuccess("============================================");
  }

  printGraphSummary(): void {
    logSuccess("========== GRAPH SUMMARY ==========");
    logInfo(`Nodes: ${this.nodes.size}`);
    let totalEdges = 0;
    const pairEdges = new Map<string, PriceEdge[]>();
    for (const [key, edgeList] of this.edges) {
      totalEdges += edgeList.length;
      const from = this.mintToSymbol(key.split(":")[0]);
      const to = this.mintToSymbol(key.split(":")[1]);
      const pairKey = `${from}/${to}`;
      if (!pairEdges.has(pairKey)) pairEdges.set(pairKey, []);
      pairEdges.get(pairKey)!.push(...edgeList);
    }
    logInfo(`Total edges: ${totalEdges}`);

    for (const [pair, edges] of pairEdges) {
      const uniquePools = new Map<string, PriceEdge>();
      for (const e of edges) uniquePools.set(e.poolAddress, e);
      logInfo(`${pair}: ${uniquePools.size} pool(s)`);
      for (const [, e] of uniquePools) {
        const icon = e.health === "VALID" ? "✅" : e.health === "LOW_LIQUIDITY" ? "⚠️" : "❌";
        logInfo(`  ${icon} ${e.dex} | pool: ${e.poolAddress.substring(0, 12)}... | price: $${(e.price > 0 ? e.price : 0).toFixed(6)} | liq: ${(e.liquidity / 1_000_000).toFixed(1)}M | health: ${e.health} | src: ${e.source}`);
      }
    }
    logSuccess("====================================");
  }

  getNodeCount(): number { return this.nodes.size; }

  getEdgeCount(): number {
    let count = 0;
    for (const [, edgeList] of this.edges) count += edgeList.length;
    return count;
  }

  getValidEdgeCount(): number {
    let count = 0;
    for (const [, edgeList] of this.edges) {
      count += edgeList.filter((e) => e.health === "VALID").length;
    }
    return count;
  }

  getPairSurfaceLabels(): string[] {
    const labels = new Set<string>();
    for (const [key] of this.edges) {
      const from = this.mintToSymbol(key.split(":")[0]);
      const to = this.mintToSymbol(key.split(":")[1]);
      labels.add(`${from}/${to}`);
    }
    return Array.from(labels);
  }

  mintToSymbol(mint: string): string {
    const map: Record<string, string> = {
      "So11111111111111111111111111111111111111112": "SOL",
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": "USDC",
      "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": "USDT",
      "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN": "JUP",
      "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": "BONK",
      "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm": "WIF",
      "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": "RAY",
    };
    return map[mint] || mint.substring(0, 6);
  }

  clear(): void {
    this.nodes.clear();
    this.edges.clear();
  }
}

export const priceGraph = new PriceGraph();
