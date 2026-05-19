import { priceGraph, PriceEdge } from "../graph";
import { marketState } from "../market";
import { EdgeQualityScore } from "./types";
import { edgeQualityScorer } from "./edge-quality";
import { logSuccess, logInfo, logWarning, logDebug } from "../logger";
import { TradeHop, TradePath, PathEnumerationResult } from "./types";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const MAX_HOPS = 3;
const MIN_NET_BPS = 0.5;
const STALE_AGE_MS = 10_000;
const SLIPPAGE_BPS_PER_HOP = 2;
const BASE_FEE_BPS = 0.5;
const SOL_PRICE_USD = 160;
const LAMPORTS_PER_SOL = 1_000_000_000;
const MAX_FEE_BPS = 25;
const MIN_LIQUIDITY_RAW = 50_000;

function estimatedSlippageBps(liquidity: number, tradeSizeSol: number): number {
  if (liquidity <= 0 || tradeSizeSol <= 0) return 10;
  const ratio = (tradeSizeSol * SOL_PRICE_USD) / liquidity;
  if (ratio < 0.001) return 0.5;
  if (ratio < 0.005) return 1;
  if (ratio < 0.01) return 2;
  if (ratio < 0.05) return 5;
  if (ratio < 0.1) return 10;
  return 20;
}

function scoreEdge(edge: PriceEdge): number {
  let score = 0;
  if (edge.health !== "VALID") return -1;
  if (edge.fee > MAX_FEE_BPS) return -1;
  if (edge.liquidity < MIN_LIQUIDITY_RAW) return -1;
  const age = Date.now() - edge.timestamp;
  if (age > STALE_AGE_MS) return -1;
  score += Math.min(1, edge.liquidity / 10_000_000) * 40;
  score += Math.max(0, 1 - age / 5000) * 30;
  score += (1 / Math.max(1, edge.fee)) * 20;
  score += edge.source === "provider" || edge.source === "ws_direct" ? 10 : 0;
  return score;
}

export class BestEdgeSelector {
  private bestEdges = new Map<string, PriceEdge>();
  private lastRefresh = 0;
  private readonly REFRESH_INTERVAL = 3_000;

  refresh(): void {
    const now = Date.now();
    if (now - this.lastRefresh < this.REFRESH_INTERVAL) return;
    this.lastRefresh = now;
    this.bestEdges.clear();

    const pairMap = new Map<string, PriceEdge[]>();
    for (const [key, edgeList] of (priceGraph as any).edges) {
      for (const edge of edgeList) {
        if (edge.health !== "VALID") continue;
        const pairKey = `${edge.from}:${edge.to}`;
        if (!pairMap.has(pairKey)) pairMap.set(pairKey, []);
        pairMap.get(pairKey)!.push(edge);
      }
    }

    for (const [pairKey, edges] of pairMap) {
      const scored = edges.map(e => ({ edge: e, score: scoreEdge(e) })).filter(s => s.score >= 0);
      if (scored.length === 0) continue;
      scored.sort((a, b) => b.score - a.score);
      this.bestEdges.set(pairKey, scored[0].edge);
    }

    logDebug(`EdgeSelector: ${this.bestEdges.size} best edges refrescados de ${pairMap.size} pares`);
  }

  getBestEdge(from: string, to: string): PriceEdge | null {
    return this.bestEdges.get(`${from}:${to}`) || null;
  }

  getBestEdgeForHop(fromSymbol: string, toSymbol: string): PriceEdge | null {
    for (const [, edge] of this.bestEdges) {
      const symFrom = priceGraph.mintToSymbol(edge.from);
      const symTo = priceGraph.mintToSymbol(edge.to);
      if (symFrom === fromSymbol && symTo === toSymbol) return edge;
      if (symFrom === toSymbol && symTo === fromSymbol) {
        return { ...edge, from: edge.to, to: edge.from, price: edge.inversePrice, inversePrice: edge.price };
      }
    }
    return null;
  }

  reset(): void {
    this.bestEdges.clear();
    this.lastRefresh = 0;
  }
}

export const bestEdgeSelector = new BestEdgeSelector();

export class PathBuilder {
  private cycleCache = new Set<string>();
  private lastEnumeration = 0;
  private enumerationCount = 0;
  totalCyclesFound = 0;
  totalPathsExplored = 0;
  totalRejected = { stale: 0, fees: 0, slippage: 0, disconnected: 0, duplicate: 0 };

  enumerateTriangularPaths(): PathEnumerationResult {
    const startTime = Date.now();
    this.enumerationCount++;
    bestEdgeSelector.refresh();

    const paths: TradePath[] = [];
    const seenKeys = new Set<string>();
    const explored: string[] = [];
    const rejected = { stale: 0, fees: 0, slippage: 0, disconnected: 0, duplicate: 0 };
    let cyclesFound = 0;

    const symbols = ["SOL", "USDC", "USDT", "JUP", "WIF", "mSOL", "jitoSOL", "BONK", "RAY"];

    for (const startSym of symbols) {
      const startMint = this.symbolToMint(startSym);
      if (!startMint) continue;

      const visitedMints = new Set<string>();
      const pathMints: string[] = [];
      const pathSyms: string[] = [];
      const hopEdges: PriceEdge[] = [];

      const dfs = (currentMint: string, currentSym: string, depth: number) => {
        if (depth > MAX_HOPS) return;

        if (depth >= 2 && currentMint === startMint) {
          cyclesFound++;
          const key = [...pathMints].sort().join("-");
          if (seenKeys.has(key)) { rejected.duplicate++; return; }
          seenKeys.add(key);

          const path = this.buildPathFromEdges(hopEdges, pathSyms, pathMints);
          if (path) {
            if (path.netSpreadBps < MIN_NET_BPS) { rejected.stale++; return; }
            paths.push(path);
            explored.push(path.routeLabel);
          }
          return;
        }

        if (visitedMints.has(currentMint) && currentMint !== startMint) {
          rejected.disconnected++;
          return;
        }

        visitedMints.add(currentMint);

        for (const [key, edgeList] of (priceGraph as any).edges) {
          const [src, dst] = key.split(":");
          if (src !== currentMint) continue;
          const valid = edgeList.filter((e: PriceEdge) => e.health === "VALID");
          if (valid.length === 0) continue;

          const bestEdge = valid.reduce((b: PriceEdge, e: PriceEdge) => {
            const s1 = scoreEdge(b);
            const s2 = scoreEdge(e);
            return s2 > s1 ? e : b;
          });

          const dstSym = priceGraph.mintToSymbol(dst);
          if (depth === 0 && dstSym === startSym) continue;

          pathMints.push(dst);
          pathSyms.push(dstSym);
          hopEdges.push(bestEdge);
          dfs(dst, dstSym, depth + 1);
          hopEdges.pop();
          pathSyms.pop();
          pathMints.pop();
        }

        if (currentMint !== startMint) visitedMints.delete(currentMint);
      };

      dfs(startMint, startSym, 0);
    }

    this.totalPathsExplored += explored.length;
    Object.assign(this.totalRejected, rejected);

    const result: PathEnumerationResult = {
      paths,
      totalExplored: explored.length,
      cyclesFound,
      rejectedStale: rejected.stale,
      rejectedFees: rejected.fees,
      rejectedSlippage: rejected.slippage,
      rejectedDisconnected: rejected.disconnected,
      rejectedDuplicate: rejected.duplicate,
      executionTimeMs: Date.now() - startTime,
    };

    this.logDebug(result);
    return result;
  }

  private buildPathFromEdges(edges: PriceEdge[], symbols: string[], mints: string[]): TradePath | null {
    if (edges.length < 2 || symbols.length < 2) return null;

    const fullSyms = [symbols[0], ...symbols.slice(1)];
    const hops: TradeHop[] = [];
    let grossBpsProduct = 0;
    let totalFeeBps = 0;
    let totalSlippageBps = 0;
    let minLiq = Infinity;

    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      const fromSym = i === 0 ? fullSyms[i] : priceGraph.mintToSymbol(e.from);
      const toSym = priceGraph.mintToSymbol(e.to);

      const age = Date.now() - e.timestamp;
      if (age > STALE_AGE_MS) return null;

      const slippageBps = estimatedSlippageBps(e.liquidity, 0.05);
      const hopFeeBps = e.fee + SLIPPAGE_BPS_PER_HOP;
      const edgeGrossBps = e.price > 0 ? Math.abs((1 / e.price) - 1) * 10000 : 0;

      hops.push({
        fromToken: e.from,
        toToken: e.to,
        fromSymbol: fromSym,
        toSymbol: toSym,
        dex: e.dex,
        poolAddress: e.poolAddress,
        price: e.price,
        inversePrice: e.inversePrice,
        liquidity: e.liquidity,
        feeBps: e.fee,
        slot: e.slot,
        age,
        health: e.health,
      });

      grossBpsProduct += edgeGrossBps;
      totalFeeBps += hopFeeBps;
      totalSlippageBps += slippageBps;
      if (e.liquidity < minLiq) minLiq = e.liquidity;
    }

    const netBps = Math.max(0, grossBpsProduct - totalFeeBps - totalSlippageBps);
    const profitSol = (netBps / 10000) * 0.05;
    const profitUsd = profitSol * SOL_PRICE_USD;

    const confidence = Math.min(1,
      0.3 +
      Math.min(0.3, profitUsd / 0.05) +
      Math.min(0.2, minLiq / 10_000_000) * 0.2 +
      (netBps > 2 ? 0.2 : 0)
    );

    const routeLabel = fullSyms.join(" → ");

    return {
      hops,
      pathSymbols: fullSyms,
      pathMints: mints,
      grossSpreadBps: grossBpsProduct,
      totalFeeBps,
      totalSlippageBps,
      netSpreadBps: netBps,
      estimatedProfitUsd: profitUsd,
      optimalSizeSol: 0.05,
      confidence,
      detectedAt: Date.now(),
      routeLabel,
    };
  }

  private symbolToMint(symbol: string): string | null {
    const map: Record<string, string> = {
      SOL: "So11111111111111111111111111111111111111112",
      USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
      JUP: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
      BONK: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
      RAY: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
      mSOL: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
      jitoSOL: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
      WIF: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
    };
    return map[symbol] || null;
  }

  private logDebug(result: PathEnumerationResult): void {
    logSuccess("══════════ GRAPH WALK ══════════");
    logInfo(`Start node: SOL`);
    const neighbors = priceGraph.getNeighbors(SOL_MINT);
    logInfo(`Neighbors: [${neighbors.map(n => priceGraph.mintToSymbol(n.token)).join(", ")}]`);
    logInfo(`Paths explored: ${result.totalExplored}`);
    logInfo(`Cycles found: ${result.cyclesFound}`);
    logSuccess("════════════════════════════════");

    if (result.paths.length === 0) {
      logWarning("PathBuilder: 0 rutas rentables encontradas");
      return;
    }

    for (const path of result.paths.slice(0, 5)) {
      logSuccess("══════════ TRIANGULAR DETECTION ══════════");
      logInfo(`PATH: ${path.routeLabel}`);
      for (const hop of path.hops) {
        logInfo(`  ${hop.fromSymbol} → ${hop.toSymbol} via ${hop.dex} (${hop.poolAddress.substring(0, 8)}...) price=${hop.price.toFixed(6)} liq=${(hop.liquidity / 1_000_000).toFixed(1)}M fee=${hop.feeBps}bps`);
      }
      logInfo(`gross: ${path.grossSpreadBps.toFixed(2)} bps`);
      const feesShare = path.totalFeeBps.toFixed(2);
      const slippShare = path.totalSlippageBps.toFixed(2);
      logInfo(`fees: -${feesShare} bps | slippage: -${slippShare} bps`);
      logInfo(`net: ${path.netSpreadBps.toFixed(2)} bps (${(path.netSpreadBps / 100).toFixed(4)}%)`);
      logInfo(`profit: $${path.estimatedProfitUsd.toFixed(4)} | size: ${path.optimalSizeSol.toFixed(2)} SOL`);
      logInfo(`confidence: ${(path.confidence * 100).toFixed(0)}% | status: ${path.netSpreadBps >= MIN_NET_BPS ? "PROFITABLE" : "REJECTED"}`);
      logSuccess("══════════════════════════════════════════");
    }
  }

  reset(): void {
    this.cycleCache.clear();
    this.lastEnumeration = 0;
    this.enumerationCount = 0;
    this.totalCyclesFound = 0;
    this.totalPathsExplored = 0;
    this.totalRejected = { stale: 0, fees: 0, slippage: 0, disconnected: 0, duplicate: 0 };
  }
}

export const pathBuilder = new PathBuilder();
