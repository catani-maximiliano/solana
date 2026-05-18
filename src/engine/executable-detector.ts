import { priceGraph } from "../graph";
import { surfaceEngine } from "./market-surface-engine";
import { slippageEstimator } from "./slippage-estimator";
import { ExecutableOpportunity, calculateFreshnessScore, calculateLatencyRisk } from "./types";
import { logSuccess, logWarning, logInfo, logCrossDexPair, logSpread } from "../logger";
import { eventBus } from "../events";
import { marketValidator } from "../market-validator";

const MIN_NET_SPREAD_BPS = 0.5;
const MAX_CANDIDATES = 10;
const DETECTION_COOLDOWN_MS = 2_000;
const MIN_CONFIDENCE = 0.3;

export class ExecutableDetector {
  private opportunities: ExecutableOpportunity[] = [];
  private detectedSet = new Set<string>();
  private lastDetectionTime = 0;
  private totalScans = 0;
  private totalOpportunities = 0;

  start(): void {
    eventBus.subscribe("pool:update", () => {
      surfaceEngine.invalidateCache();
      this.scan();
    });
    logInfo("ExecutableDetector: event-driven — escuchando pool:update");
  }

  scan(): ExecutableOpportunity[] {
    const now = Date.now();
    if (now - this.lastDetectionTime < DETECTION_COOLDOWN_MS) return [];
    this.lastDetectionTime = now;
    this.totalScans++;

    if (!marketValidator.canEmitSignals()) return [];

    const found: ExecutableOpportunity[] = [];
    const labels = priceGraph.getPairSurfaceLabels();

    for (const label of labels) {
      const report = surfaceEngine.getSurface(label);
      if (!report || report.pools.length < 2) continue;
      if (report.executableSpreadBps < MIN_NET_SPREAD_BPS) continue;

      const validPools = report.pools;

      for (let i = 0; i < validPools.length; i++) {
        for (let j = i + 1; j < validPools.length; j++) {
          const poolA = validPools[i];
          const poolB = validPools[j];

          const buyPool = poolA.price < poolB.price ? poolA : poolB;
          const sellPool = poolA.price < poolB.price ? poolB : poolA;

          const optimal = slippageEstimator.findOptimalTrade(buyPool.poolAddress, sellPool.poolAddress);

          if (optimal.netProfit <= 0) continue;

          const grossSpreadBps = ((sellPool.price - buyPool.price) / buyPool.price) * 10000;
          const netProfitUsd = optimal.netProfit;
          const netProfitSol = netProfitUsd / sellPool.price;

          const freshnessScore = calculateFreshnessScore(
            Math.min(buyPool.age, sellPool.age),
            Math.abs(buyPool.slot - sellPool.slot),
          );
          const latencyRisk = calculateLatencyRisk(
            Math.min(buyPool.age, sellPool.age),
            Math.abs(buyPool.slot - sellPool.slot),
          );

          const confidence = this.calcConfidence(optimal, freshnessScore, buyPool, sellPool);

          if (confidence < MIN_CONFIDENCE) continue;

          const netSpreadBps = grossSpreadBps - ((optimal.buySim.priceImpact + optimal.sellSim.priceImpact) * 100) - (buyPool.fee + sellPool.fee);

          const opp: ExecutableOpportunity = {
            pair: label,
            symbolA: report.symbolA,
            symbolB: report.symbolB,
            buyPool: buyPool.poolAddress,
            sellPool: sellPool.poolAddress,
            buyDex: buyPool.dex,
            sellDex: sellPool.dex,
            buyPrice: buyPool.price,
            sellPrice: sellPool.price,
            grossSpreadBps,
            netSpreadBps: Math.max(0, netSpreadBps),
            estimatedProfitUsd: netProfitUsd,
            estimatedProfitSol: netProfitSol,
            totalFees: optimal.buySim.feeCost + optimal.sellSim.feeCost,
            slippageCost: 0,
            impactCost: optimal.buySim.priceImpact + optimal.sellSim.priceImpact,
            executableSize: optimal.size,
            optimalSize: optimal.size,
            confidence,
            latencyRisk,
            freshnessScore,
            detectedAt: Date.now(),
          };

          const oppKey = `${opp.buyPool}:${opp.sellPool}:${opp.executableSize}`;
          if (this.detectedSet.has(oppKey)) continue;
          this.detectedSet.add(oppKey);

          found.push(opp);
        }
      }
    }

    found.sort((a, b) => b.estimatedProfitUsd - a.estimatedProfitUsd);
    this.opportunities = found.slice(0, MAX_CANDIDATES);
    this.totalOpportunities += this.opportunities.length;

    if (this.opportunities.length > 0) {
      const best = this.opportunities[0];
      logSuccess(`🚀 ${best.pair}: ${best.buyDex}→${best.sellDex} profit=$${best.estimatedProfitUsd.toFixed(6)} size=${best.optimalSize}SOL spread=${best.grossSpreadBps.toFixed(2)}bps net=${best.netSpreadBps.toFixed(2)}bps ✅`);
      logCrossDexPair(best.buyDex, best.sellDex, best.grossSpreadBps, best.optimalSize, best.estimatedProfitUsd, best.confidence);
      logSpread(best.pair, best.optimalSize, best.buyDex, best.sellDex, best.grossSpreadBps, best.estimatedProfitUsd, 0, best.confidence);
    }

    return this.opportunities;
  }

  private calcConfidence(
    optimal: { netProfit: number; size: number },
    freshnessScore: number,
    buyPool: { liquidity: number; fee: number },
    sellPool: { liquidity: number; fee: number },
  ): number {
    let score = 0.4;
    if (optimal.netProfit > 0.001) score += 0.2;
    if (optimal.netProfit > 0.01) score += 0.15;
    if (freshnessScore > 0.7) score += 0.15;
    if (buyPool.liquidity > 10_000_000 && sellPool.liquidity > 10_000_000) score += 0.1;
    if (buyPool.fee <= 5 && sellPool.fee <= 5) score += 0.05;
    return Math.min(1, score);
  }

  getOpportunities(): ExecutableOpportunity[] { return this.opportunities; }

  getStats() {
    return {
      totalScans: this.totalScans,
      totalOpportunities: this.totalOpportunities,
      activeCandidates: this.opportunities.length,
      detectedKeys: this.detectedSet.size,
    };
  }

  reset(): void {
    this.opportunities = [];
    this.detectedSet.clear();
    this.totalScans = 0;
    this.totalOpportunities = 0;
    this.lastDetectionTime = 0;
  }
}

export const executableDetector = new ExecutableDetector();
