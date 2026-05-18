import { BotConfig } from "./config";
import { logInfo, logSuccess, logWarning, logCrossDexPair, logSpread } from "./logger";
import { eventBus } from "./events";
import { priceGraph, PriceEdge, MarketSurface } from "./graph";
import { marketValidator } from "./market-validator";
import { marketState } from "./market";

export interface LocalOpportunityCandidate {
  pair: string;
  symbolA: string;
  symbolB: string;
  poolBuy: string;
  poolSell: string;
  dexBuy: string;
  dexSell: string;
  priceBuy: number;
  priceSell: number;
  spreadPct: number;
  liquidity: number;
  confidence: number;
  detectedAt: number;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

const OPPORTUNITY_MIN_SPREAD_BPS = 1;
const CONFIDENCE_MIN = 0.3;
const LIQUIDITY_MIN = 1_000;
const FRESHNESS_MAX_MS = 10_000;
const CACHE_TTL_MS = 10_000;
const MAX_CANDIDATES = 20;

export function isOpportunityValid(opp: LocalOpportunityCandidate): ValidationResult {
  if (opp.spreadPct <= 0) {
    return { valid: false, reason: `spread ${opp.spreadPct.toFixed(4)}% <= 0` };
  }
  if (opp.confidence < CONFIDENCE_MIN) {
    return { valid: false, reason: `confianza ${(opp.confidence * 100).toFixed(0)}% < ${(CONFIDENCE_MIN * 100).toFixed(0)}%` };
  }
  if (opp.liquidity < LIQUIDITY_MIN) {
    return { valid: false, reason: `liquidez ${opp.liquidity.toLocaleString()} < ${LIQUIDITY_MIN.toLocaleString()}` };
  }
  const age = Date.now() - opp.detectedAt;
  if (age > FRESHNESS_MAX_MS) {
    return { valid: false, reason: `stale ${age}ms > ${FRESHNESS_MAX_MS}ms` };
  }
  if (!marketValidator.canEmitSignals()) {
    return { valid: false, reason: "signal quality insuficiente" };
  }
  const quality = marketValidator.getSignalQuality();
  if (quality === "BLOCKED" || quality === "FALLBACK_ONLY") {
    return { valid: false, reason: `signal quality: ${quality}` };
  }
  return { valid: true };
}

class GraphDetector {
  private lastScanTime = 0;
  private candidates: LocalOpportunityCandidate[] = [];
  private totalScans = 0;
  private totalCandidates = 0;

  start(): void {
    eventBus.subscribe("pool:update", () => {
      this.scanGraph();
    });
    logInfo("GraphDetector: event-driven — escuchando pool:update");
  }

  scanGraph(): LocalOpportunityCandidate[] {
    this.lastScanTime = Date.now();
    this.totalScans++;

    if (!marketValidator.canEmitSignals()) {
      return [];
    }

    const found: LocalOpportunityCandidate[] = [];
    const surfaces = priceGraph.getPairSurfaceLabels();

    for (const label of surfaces) {
      const surface = priceGraph.getMarketSurface(label);
      if (!surface) continue;

      const validPools = surface.pools.filter((p) => p.health === "VALID" && p.price > 0);
      if (validPools.length < 2) continue;

      logInfo(`GraphDetector: ${validPools.length} pools válidos para ${label} — ${validPools.map((p) => p.dex).join(" vs ")}`);

      for (let i = 0; i < validPools.length; i++) {
        for (let j = i + 1; j < validPools.length; j++) {
          const poolA = validPools[i];
          const poolB = validPools[j];

          if (poolA.price <= 0 || poolB.price <= 0) continue;

          const spreadPct = Math.abs((poolB.price - poolA.price) / poolA.price) * 100;

          if (spreadPct < OPPORTUNITY_MIN_SPREAD_BPS / 100) {
            logInfo(`GraphDetector: ${poolA.dex} vs ${poolB.dex} spread=${spreadPct.toFixed(4)}% — bajo umbral`);
            continue;
          }

          const candidate: LocalOpportunityCandidate = {
            pair: label,
            symbolA: surface.symbolA,
            symbolB: surface.symbolB,
            poolBuy: poolA.price < poolB.price ? poolA.poolAddress : poolB.poolAddress,
            poolSell: poolA.price < poolB.price ? poolB.poolAddress : poolA.poolAddress,
            dexBuy: poolA.price < poolB.price ? poolA.dex : poolB.dex,
            dexSell: poolA.price < poolB.price ? poolB.dex : poolA.dex,
            priceBuy: Math.min(poolA.price, poolB.price),
            priceSell: Math.max(poolA.price, poolB.price),
            spreadPct,
            liquidity: Math.min(poolA.liquidity, poolB.liquidity),
            confidence: this.calculateConfidence(poolA.age, poolB.age, poolA.health, poolB.health),
            detectedAt: Date.now(),
          };

          const validation = isOpportunityValid(candidate);
          if (validation.valid) {
            found.push(candidate);
            logCrossDexPair(candidate.dexBuy, candidate.dexSell, candidate.spreadPct, 0, 0, candidate.confidence);
            logSpread(candidate.pair, 0, candidate.dexBuy, candidate.dexSell, candidate.spreadPct, 0, 0, candidate.confidence);
          }
        }
      }
    }

    this.candidates = found.slice(0, MAX_CANDIDATES);
    this.totalCandidates += found.length;

    if (found.length > 0) {
      logSuccess(`GraphDetector: ${found.length} oportunidad(es) local(es) — ${found[0].pair} spread=${found[0].spreadPct.toFixed(4)}%`);
    }

    if (this.totalScans % 10 === 0) {
      for (const label of surfaces) {
        const sp = priceGraph.getMultiPoolSpread(label);
        logInfo(`Multi-pool spread [${label}]: ${sp.validPools}/${sp.pools} pools válidos, spread=${sp.spreadPct.toFixed(4)}% ${sp.exists ? "✅" : "❌"}`);
      }
    }

    return this.candidates;
  }

  private calculateConfidence(ageA: number, ageB: number, healthA: string, healthB: string): number {
    let score = 0.5;
    if (ageA < 5000) score += 0.15;
    if (ageB < 5000) score += 0.15;
    if (healthA === "VALID") score += 0.1;
    if (healthB === "VALID") score += 0.1;
    return Math.min(1, score);
  }

  getCandidates(): LocalOpportunityCandidate[] {
    if (Date.now() - this.lastScanTime > CACHE_TTL_MS) {
      return [];
    }
    return this.candidates;
  }

  getStats(): { totalScans: number; totalCandidates: number; lastScanTime: number; candidates: number } {
    return {
      totalScans: this.totalScans,
      totalCandidates: this.totalCandidates,
      lastScanTime: this.lastScanTime,
      candidates: this.candidates.length,
    };
  }

  reset(): void {
    this.candidates = [];
    this.totalScans = 0;
    this.totalCandidates = 0;
    this.lastScanTime = 0;
  }
}

export const graphDetector = new GraphDetector();

export async function detectOpportunities(config: BotConfig): Promise<LocalOpportunityCandidate[]> {
  return graphDetector.scanGraph();
}
