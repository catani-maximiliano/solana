import { logInfo, logSuccess, logWarning, logDebug } from "../logger";
import { quoteEngine, QuoteResult } from "./quote-engine";
import { tokenDiscovery } from "./token-discovery";
import { ProfitCalculator, ProfitEstimate } from "./profit-calculator";
import { Connection } from "@solana/web3.js";

export interface RouteHop {
  inputMint: string;
  outputMint: string;
  inputSymbol: string;
  outputSymbol: string;
  amountIn: number;
  amountOut: number;
  dexes: string[];
}

export interface MultiHopRoute {
  hops: RouteHop[];
  profitEstimate: ProfitEstimate | null;
  grossProfitLamports: number;
  routeKey: string;
  routeLabel: string;
  routeLength: number;
  confidence: number;
  detectedAt: number;
}

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const DEFAULT_AMOUNT_LAMPORTS = 50_000_000;
const DEFAULT_SLIPPAGE_BPS = 50;
const ROUTE_CACHE_TTL = 15_000;

interface RouteCacheEntry {
  routes: MultiHopRoute[];
  timestamp: number;
}

export class RouteFinder {
  private profitCalc: ProfitCalculator;
  private routeCache = new Map<string, RouteCacheEntry>();
  private totalRoutesFound = 0;
  private totalRouteScans = 0;

  constructor(connection: Connection) {
    this.profitCalc = new ProfitCalculator(connection);
  }

  async discoverTriangularRoutes(amountLamports: number = DEFAULT_AMOUNT_LAMPORTS): Promise<MultiHopRoute[]> {
    this.totalRouteScans++;
    const quoteTokens = tokenDiscovery.getQuoteTokens();
    const allPairs = tokenDiscovery.getTopPairs(40);
    const routes: MultiHopRoute[] = [];

    const quoteMints = quoteTokens.map((t) => t.mint);
    const solMint = SOL_MINT;

    for (const pair of allPairs) {
      const tokenMint = pair.base.mint;
      if (tokenMint === solMint) continue;
      if (quoteMints.includes(tokenMint)) continue;

      const routeKey = `SOL:${pair.base.symbol}:USDC`;
      const cached = this.routeCache.get(routeKey);
      if (cached && Date.now() - cached.timestamp < ROUTE_CACHE_TTL) {
        routes.push(...cached.routes);
        continue;
      }

      try {
        const solToTokenResult = await quoteEngine.getQuote({
          inputMint: solMint,
          outputMint: tokenMint,
          amountLamports,
          slippageBps: DEFAULT_SLIPPAGE_BPS,
          onlyDirectRoutes: false,
        });

        if (!solToTokenResult || solToTokenResult.amountOut <= 0) continue;

        const tokenToUsdcResult = await quoteEngine.getQuote({
          inputMint: tokenMint,
          outputMint: USDC_MINT,
          amountLamports: solToTokenResult.amountOut,
          slippageBps: DEFAULT_SLIPPAGE_BPS,
          onlyDirectRoutes: false,
        });

        if (!tokenToUsdcResult || tokenToUsdcResult.amountOut <= 0) continue;

        const usdcToSolResult = await quoteEngine.getQuote({
          inputMint: USDC_MINT,
          outputMint: solMint,
          amountLamports: tokenToUsdcResult.amountOut,
          slippageBps: DEFAULT_SLIPPAGE_BPS,
          onlyDirectRoutes: false,
        });

        if (!usdcToSolResult || usdcToSolResult.amountOut <= 0) continue;

        const grossProfitLamports = usdcToSolResult.amountOut - amountLamports;

        const allRoutePlans = [
          ...solToTokenResult.routePlan,
          ...tokenToUsdcResult.routePlan,
          ...usdcToSolResult.routePlan,
        ];

        const profitEstimate = await this.profitCalc.estimate(
          grossProfitLamports,
          allRoutePlans,
          DEFAULT_SLIPPAGE_BPS,
          amountLamports,
        );

        const hops: RouteHop[] = [
          {
            inputMint: solMint,
            outputMint: tokenMint,
            inputSymbol: "SOL",
            outputSymbol: pair.base.symbol,
            amountIn: solToTokenResult.amountIn,
            amountOut: solToTokenResult.amountOut,
            dexes: solToTokenResult.dexesUsed,
          },
          {
            inputMint: tokenMint,
            outputMint: USDC_MINT,
            inputSymbol: pair.base.symbol,
            outputSymbol: "USDC",
            amountIn: tokenToUsdcResult.amountIn,
            amountOut: tokenToUsdcResult.amountOut,
            dexes: tokenToUsdcResult.dexesUsed,
          },
          {
            inputMint: USDC_MINT,
            outputMint: solMint,
            inputSymbol: "USDC",
            outputSymbol: "SOL",
            amountIn: usdcToSolResult.amountIn,
            amountOut: usdcToSolResult.amountOut,
            dexes: usdcToSolResult.dexesUsed,
          },
        ];

        const route: MultiHopRoute = {
          hops,
          profitEstimate,
          grossProfitLamports,
          routeKey,
          routeLabel: `SOL → ${pair.base.symbol} → USDC → SOL`,
          routeLength: 3,
          confidence: profitEstimate.isProfitable ? 0.7 : 0.3,
          detectedAt: Date.now(),
        };

        this.routeCache.set(routeKey, { routes: [route], timestamp: Date.now() });
        routes.push(route);

        if (grossProfitLamports > 0) {
          logSuccess(`RouteFinder: SOL→${pair.base.symbol}→USDC→SOL gross=$${profitEstimate.grossProfitUsd.toFixed(4)} net=$${profitEstimate.netProfitUsd.toFixed(4)} threshold=$${profitEstimate.minProfitThreshold.toFixed(4)} ${profitEstimate.isProfitable ? "✅" : "❌"}`);
        }
      } catch (err) {
        logDebug(`RouteFinder error ${pair.base.symbol}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    this.totalRoutesFound += routes.length;
    this.cleanRouteCache();
    return routes.sort((a, b) => (b.profitEstimate?.netProfitUsd || 0) - (a.profitEstimate?.netProfitUsd || 0));
  }

  async discoverDirectRoutes(amountLamports: number = DEFAULT_AMOUNT_LAMPORTS): Promise<MultiHopRoute[]> {
    const allPairs = tokenDiscovery.getTopPairs(50);
    const routes: MultiHopRoute[] = [];

    for (const pair of allPairs) {
      const routeKey = `${pair.base.symbol}/${pair.quote.symbol}`;
      const cached = this.routeCache.get(routeKey);
      if (cached && Date.now() - cached.timestamp < ROUTE_CACHE_TTL) {
        routes.push(...cached.routes);
        continue;
      }

      try {
        const forwardResult = await quoteEngine.getQuote({
          inputMint: pair.base.mint,
          outputMint: pair.quote.mint,
          amountLamports,
          slippageBps: DEFAULT_SLIPPAGE_BPS,
          onlyDirectRoutes: false,
        });

        if (!forwardResult || forwardResult.amountOut <= 0) continue;

        const backwardResult = await quoteEngine.getQuote({
          inputMint: pair.quote.mint,
          outputMint: pair.base.mint,
          amountLamports: forwardResult.amountOut,
          slippageBps: DEFAULT_SLIPPAGE_BPS,
          onlyDirectRoutes: false,
        });

        if (!backwardResult || backwardResult.amountOut <= 0) continue;

        const grossProfitLamports = backwardResult.amountOut - amountLamports;
        const allRoutePlans = [...forwardResult.routePlan, ...backwardResult.routePlan];
        const profitEstimate = await this.profitCalc.estimate(grossProfitLamports, allRoutePlans, DEFAULT_SLIPPAGE_BPS, amountLamports);

        const hop: RouteHop = {
          inputMint: pair.base.mint,
          outputMint: pair.quote.mint,
          inputSymbol: pair.base.symbol,
          outputSymbol: pair.quote.symbol,
          amountIn: forwardResult.amountIn,
          amountOut: forwardResult.amountOut,
          dexes: forwardResult.dexesUsed,
        };

        const route: MultiHopRoute = {
          hops: [hop],
          profitEstimate,
          grossProfitLamports,
          routeKey,
          routeLabel: `${pair.base.symbol} → ${pair.quote.symbol}`,
          routeLength: 1,
          confidence: profitEstimate.isProfitable ? 0.6 : 0.2,
          detectedAt: Date.now(),
        };

        this.routeCache.set(routeKey, { routes: [route], timestamp: Date.now() });
        routes.push(route);
      } catch {
        // skip pair on error
      }
    }

    return routes.sort((a, b) => (b.profitEstimate?.netProfitUsd || 0) - (a.profitEstimate?.netProfitUsd || 0));
  }

  private cleanRouteCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.routeCache) {
      if (now - entry.timestamp > ROUTE_CACHE_TTL * 2) {
        this.routeCache.delete(key);
      }
    }
  }

  getStats(): { totalScans: number; totalRoutesFound: number; cacheSize: number } {
    return {
      totalScans: this.totalRouteScans,
      totalRoutesFound: this.totalRoutesFound,
      cacheSize: this.routeCache.size,
    };
  }

  reset(): void {
    this.routeCache.clear();
    this.totalRoutesFound = 0;
    this.totalRouteScans = 0;
  }
}
