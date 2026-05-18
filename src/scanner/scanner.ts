import { Connection } from "@solana/web3.js";
import { logInfo, logSuccess, logWarning, logDebug } from "../logger";
import { tokenDiscovery, TokenPair } from "./token-discovery";
import { quoteEngine, QuoteResult } from "./quote-engine";
import { RouteFinder, MultiHopRoute } from "./route-finder";
import { ProfitCalculator, ProfitEstimate } from "./profit-calculator";
import { marketState } from "../market";
import { priceGraph } from "../graph";
import { circuitBreaker } from "../circuit-breaker";
import { marketValidator } from "../market-validator";
import { graphDetector, LocalOpportunityCandidate } from "../detector";

export interface RankedOpportunity {
  route: MultiHopRoute;
  score: number;
  pairLabel: string;
  isGraphValidated: boolean;
  graphCandidate?: LocalOpportunityCandidate;
}

export interface ScanConfig {
  minLiquidityUsd: number;
  profitMultiplier: number;
  maxRouteHops: number;
  pairsPerScan: number;
  enableTriangular: boolean;
  enableDirect: boolean;
  quoteSizeLamports: number;
  slippageBps: number;
  volatilityThreshold: number;
  minConfidence: number;
}

export interface ScanResult {
  opportunities: RankedOpportunity[];
  scannedPairs: number;
  scannedRoutes: number;
  profitableRoutes: number;
  totalTimeMs: number;
  rateLimitHits: number;
  errors: number;
}

const DEFAULT_CONFIG: ScanConfig = {
  minLiquidityUsd: 500_000,
  profitMultiplier: 2,
  maxRouteHops: 3,
  pairsPerScan: 20,
  enableTriangular: true,
  enableDirect: true,
  quoteSizeLamports: 50_000_000,
  slippageBps: 50,
  volatilityThreshold: 0.001,
  minConfidence: 0.3,
};

export class Scanner {
  private routeFinder: RouteFinder;
  private profitCalc: ProfitCalculator;
  private config: ScanConfig;
  private lastScanTime = 0;
  private scanCount = 0;
  private totalOpportunities = 0;
  private consecutiveEmptyScans = 0;
  private readonly ADAPTIVE_THROTTLE = 5;

  constructor(connection: Connection, config?: Partial<ScanConfig>) {
    this.routeFinder = new RouteFinder(connection);
    this.profitCalc = new ProfitCalculator(connection);
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async scan(): Promise<ScanResult> {
    const startTime = Date.now();
    this.scanCount++;
    const errors: string[] = [];
    const allOpportunities: RankedOpportunity[] = [];

    if (marketValidator.getSignalQuality() === "BLOCKED") {
      return {
        opportunities: [],
        scannedPairs: 0,
        scannedRoutes: 0,
        profitableRoutes: 0,
        totalTimeMs: Date.now() - startTime,
        rateLimitHits: 0,
        errors: 0,
      };
    }

    if (tokenDiscovery.getPairCount() === 0) {
      await tokenDiscovery.refresh();
    }

    const graphCandidates = graphDetector.getCandidates();
    const graphValidatedPairs = new Set(graphCandidates.map((c) => c.pair));

    if (this.config.enableDirect) {
      try {
        const directRoutes = await this.routeFinder.discoverDirectRoutes(this.config.quoteSizeLamports);
        for (const route of directRoutes) {
          if (!route.profitEstimate) continue;
          const score = this.calculateScore(route);

          const pairLabel = route.hops[0] ? `${route.hops[0].inputSymbol}/${route.hops[0].outputSymbol}` : route.routeLabel;
          const graphCandidate = graphCandidates.find((c) => c.pair === pairLabel);
          const isGraphValidated = !!graphCandidate;

          if (score > 0 || route.profitEstimate.isProfitable) {
            allOpportunities.push({ route, score, pairLabel, isGraphValidated, graphCandidate });
          }
        }
      } catch (err) {
        errors.push(`direct: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (this.config.enableTriangular) {
      try {
        const triangularRoutes = await this.routeFinder.discoverTriangularRoutes(this.config.quoteSizeLamports);
        for (const route of triangularRoutes) {
          if (!route.profitEstimate) continue;
          const score = this.calculateScore(route);
          if (score > 0 || route.profitEstimate.isProfitable) {
            allOpportunities.push({ route, score, pairLabel: route.routeLabel, isGraphValidated: false });
          }
        }
      } catch (err) {
        errors.push(`triangular: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const profitable = allOpportunities.filter((o) => o.route.profitEstimate?.isProfitable);
    const ranked = this.rankOpportunities(allOpportunities);
    this.totalOpportunities += profitable.length;

    if (profitable.length === 0) {
      this.consecutiveEmptyScans++;
    } else {
      this.consecutiveEmptyScans = 0;
    }

    const elapsed = Date.now() - startTime;
    const rateLimiter = (await import("../rate-limiter")).rateLimiter;
    const metrics = rateLimiter.getMetrics();

    this.lastScanTime = Date.now();

    return {
      opportunities: ranked,
      scannedPairs: tokenDiscovery.getPairCount(),
      scannedRoutes: allOpportunities.length,
      profitableRoutes: profitable.length,
      totalTimeMs: elapsed,
      rateLimitHits: metrics.rateLimitsHit,
      errors: errors.length,
    };
  }

  getAdaptiveInterval(baseIntervalMs: number): number {
    if (this.consecutiveEmptyScans >= this.ADAPTIVE_THROTTLE) {
      const multiplier = Math.min(4, 1 + this.consecutiveEmptyScans * 0.3);
      return Math.round(baseIntervalMs * multiplier);
    }
    if (circuitBreaker.isDegraded()) {
      return baseIntervalMs * 3;
    }
    return baseIntervalMs;
  }

  private calculateScore(route: MultiHopRoute): number {
    if (!route.profitEstimate) return 0;
    const p = route.profitEstimate;
    let score = 0;

    if (p.isProfitable) score += 30;
    if (p.netProfitPct > 0.1) score += 20;
    if (route.confidence > 0.5) score += 15;
    if (route.routeLength >= 2) score += 10;

    if (p.netProfitUsd <= 0 || !p.isProfitable) {
      score = Math.max(0, score - 50);
    }

    return Math.max(0, score);
  }

  private rankOpportunities(opps: RankedOpportunity[]): RankedOpportunity[] {
    return opps.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      const netA = a.route.profitEstimate?.netProfitUsd || 0;
      const netB = b.route.profitEstimate?.netProfitUsd || 0;
      return netB - netA;
    });
  }

  getScanCount(): number { return this.scanCount; }
  getTotalOpportunities(): number { return this.totalOpportunities; }
  getLastScanTime(): number { return this.lastScanTime; }

  getStats(): { scanCount: number; totalOpportunities: number; pairs: number; tokens: number; routeStats: { totalScans: number; totalRoutesFound: number } } {
    return {
      scanCount: this.scanCount,
      totalOpportunities: this.totalOpportunities,
      pairs: tokenDiscovery.getPairCount(),
      tokens: tokenDiscovery.getTokenCount(),
      routeStats: this.routeFinder.getStats(),
    };
  }

  getConfig(): ScanConfig {
    return { ...this.config };
  }

  updateConfig(partial: Partial<ScanConfig>): void {
    this.config = { ...this.config, ...partial };
    logInfo(`Scanner: config actualizado — ${JSON.stringify(this.config)}`);
  }

  reset(): void {
    this.routeFinder.reset();
    this.scanCount = 0;
    this.totalOpportunities = 0;
    this.consecutiveEmptyScans = 0;
    this.lastScanTime = 0;
  }
}
