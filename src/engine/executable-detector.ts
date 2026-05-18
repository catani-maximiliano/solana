import { priceGraph } from "../graph";
import { surfaceEngine } from "./market-surface-engine";
import { slippageEstimator } from "./slippage-estimator";
import { edgeQualityScorer } from "./edge-quality";
import { spreadPersistence } from "./spread-persistence";
import { microstructure } from "./microstructure";
import { ExecutableOpportunity, calculateFreshnessScore, calculateLatencyRisk } from "./types";
import { logSuccess, logInfo } from "../logger";
import { eventBus } from "../events";
import { marketValidator } from "../market-validator";

const MIN_NET_SPREAD_BPS = 0.3;
const MAX_CANDIDATES = 10;
const DETECTION_COOLDOWN_MS = 1_000;
const MIN_CONFIDENCE = 0.25;
const MAX_SLOT_LAG = 15;
const STALE_AGE_MS = 8_000;

export class ExecutableDetector {
  private opportunities: ExecutableOpportunity[] = [];
  private detectedKeys = new Set<string>();
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

      for (let i = 0; i < report.pools.length; i++) {
        for (let j = i + 1; j < report.pools.length; j++) {
          const a = report.pools[i];
          const b = report.pools[j];
          const buy = a.price < b.price ? a : b;
          const sell = a.price < b.price ? b : a;

          if (buy.age > STALE_AGE_MS || sell.age > STALE_AGE_MS) continue;
          if (Math.abs(buy.slot - sell.slot) > MAX_SLOT_LAG) continue;

          const optimal = slippageEstimator.findOptimalTrade(buy.poolAddress, sell.poolAddress);
          if (optimal.netProfit <= 0 || !optimal.buySim.executable || !optimal.sellSim.executable) {
            spreadPersistence.observe(`${label}:${buy.dex}->${sell.dex}`, false);
            continue;
          }

          const persistenceKey = `${label}:${buy.dex}->${sell.dex}`;
          spreadPersistence.observe(persistenceKey, true);
          const pers = spreadPersistence.getPersistence(persistenceKey);

          edgeQualityScorer.recordUpdate(buy.poolAddress, buy.price, buy.liquidity);
          edgeQualityScorer.recordUpdate(sell.poolAddress, sell.price, sell.liquidity);
          microstructure.recordPoolPrice(buy.poolAddress, buy.price);
          microstructure.recordPoolPrice(sell.poolAddress, sell.price);
          microstructure.recordPoolLiquidity(buy.poolAddress, buy.liquidity);
          microstructure.recordPoolLiquidity(sell.poolAddress, sell.liquidity);
          microstructure.recordPairSpread(label, report.spreadBps);

          const buyQ = edgeQualityScorer.getQuality(buy.poolAddress, buy.age, buy.liquidity);
          const sellQ = edgeQualityScorer.getQuality(sell.poolAddress, sell.age, sell.liquidity);
          const avgQ = (buyQ.overall + sellQ.overall) / 2;

          const grossSpreadBps = ((sell.price - buy.price) / buy.price) * 10000;
          const feesBps = buy.fee + sell.fee;
          const impactBps = optimal.buySim.priceImpact + optimal.sellSim.priceImpact;
          const netSpreadBps = Math.max(0, grossSpreadBps - feesBps - impactBps);

          const freshnessScore = calculateFreshnessScore(
            Math.min(buy.age, sell.age),
            Math.abs(buy.slot - sell.slot),
          );
          const latencyRisk = calculateLatencyRisk(
            Math.min(buy.age, sell.age),
            Math.abs(buy.slot - sell.slot),
          );

          const confidence = this.calcConfidence(optimal.netProfit, freshnessScore, buy.liquidity, sell.liquidity, avgQ);
          if (confidence < MIN_CONFIDENCE) continue;

          const oppKey = `${buy.poolAddress}:${sell.poolAddress}:${optimal.size}`;
          if (this.detectedKeys.has(oppKey)) continue;
          this.detectedKeys.add(oppKey);

          const opp: ExecutableOpportunity = {
            pair: label,
            symbolA: report.symbolA,
            symbolB: report.symbolB,
            buyPool: buy.poolAddress,
            sellPool: sell.poolAddress,
            buyDex: buy.dex,
            sellDex: sell.dex,
            buyPrice: buy.price,
            sellPrice: sell.price,
            grossSpreadBps,
            netSpreadBps,
            feesBps,
            slippageBps: impactBps,
            impactBps,
            estimatedProfitUsd: optimal.netProfit,
            estimatedProfitSol: optimal.size,
            totalFees: optimal.buySim.feeCost + optimal.sellSim.feeCost,
            slippageCost: 0,
            impactCost: impactBps,
            executableSize: optimal.size,
            optimalSize: optimal.size,
            liquidityConfidence: avgQ,
            confidence,
            latencyRisk,
            freshnessScore,
            persistenceMs: pers?.avgLifetimeMs ?? 0,
            qualityScore: avgQ,
            detectedAt: Date.now(),
          };

          found.push(opp);
        }
      }
    }

    found.sort((a, b) => this.rankScore(b) - this.rankScore(a));
    this.opportunities = found.slice(0, MAX_CANDIDATES);
    this.totalOpportunities += this.opportunities.length;

    this.logSummary();
    this.logOpportunities();

    return this.opportunities;
  }

  private rankScore(opp: ExecutableOpportunity): number {
    return (
      Math.min(1, opp.estimatedProfitUsd / 0.1) * 0.30 +
      opp.confidence * 0.20 +
      opp.freshnessScore * 0.15 +
      opp.qualityScore * 0.15 +
      (opp.latencyRisk === "LOW" ? 1 : opp.latencyRisk === "MEDIUM" ? 0.5 : 0) * 0.10 +
      Math.min(1, opp.persistenceMs / 2000) * 0.10
    );
  }

  private calcConfidence(profit: number, freshness: number, liqBuy: number, liqSell: number, avgQ: number): number {
    let score = 0.30;
    if (profit > 0.0005) score += 0.15;
    if (profit > 0.005) score += 0.15;
    if (profit > 0.05) score += 0.10;
    if (freshness > 0.7) score += 0.10;
    if (liqBuy > 10_000_000 && liqSell > 10_000_000) score += 0.10;
    if (avgQ > 0.6) score += 0.10;
    return Math.min(1, score);
  }

  private logSummary(): void {
    if (this.opportunities.length === 0) return;

    logSuccess("══════════ EXECUTABLE OPPORTUNITIES ══════════");
    for (const opp of this.opportunities) {
      const netBps = opp.netSpreadBps.toFixed(2);
      const grossBps = opp.grossSpreadBps.toFixed(2);
      const profitStr = opp.estimatedProfitUsd >= 0.001
        ? `$${opp.estimatedProfitUsd.toFixed(4)}`
        : `$${opp.estimatedProfitUsd.toFixed(6)}`;

      logSuccess(`🚀 ${opp.pair}`);
      logInfo(`  buy:  ${opp.buyDex} @ $${opp.buyPrice.toFixed(6)}`);
      logInfo(`  sell: ${opp.sellDex} @ $${opp.sellPrice.toFixed(6)}`);
      logInfo(`  grossSpread: ${grossBps} bps | netSpread: ${netBps} bps`);
      logInfo(`  fees: ${opp.feesBps.toFixed(2)} bps | impact: ${opp.impactBps.toFixed(2)} bps`);
      logInfo(`  optimalSize: ${opp.optimalSize.toFixed(3)} SOL`);
      logInfo(`  estimatedProfit: ${profitStr}`);
      logInfo(`  persistence: ${opp.persistenceMs.toFixed(0)}ms | confidence: ${(opp.confidence * 100).toFixed(0)}% | latency: ${opp.latencyRisk}`);
      logInfo("");
    }
    logSuccess("══════════════════════════════════════════════");
  }

  private logOpportunities(): void { }

  getOpportunities(): ExecutableOpportunity[] { return this.opportunities; }

  getStats() {
    return {
      totalScans: this.totalScans,
      totalOpportunities: this.totalOpportunities,
      activeCandidates: this.opportunities.length,
      detectedKeys: this.detectedKeys.size,
      persistence: spreadPersistence.getStats(),
    };
  }

  reset(): void {
    this.opportunities = [];
    this.detectedKeys.clear();
    this.totalScans = 0;
    this.totalOpportunities = 0;
    this.lastDetectionTime = 0;
    edgeQualityScorer.reset();
    spreadPersistence.reset();
    microstructure.reset();
  }
}

export const executableDetector = new ExecutableDetector();
