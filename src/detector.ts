import { BotConfig } from "./config";
import { logInfo, logSuccess } from "./logger";
import { marketValidator } from "./market-validator";
import { executableDetector, surfaceEngine, ExecutableOpportunity } from "./engine";
import { priceGraph } from "./graph";

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

const CONFIDENCE_MIN = 0.3;
const LIQUIDITY_MIN = 1_000;
const FRESHNESS_MAX_MS = 10_000;
const CACHE_TTL_MS = 10_000;
const MAX_CANDIDATES = 20;

function oppToCandidate(opp: ExecutableOpportunity): LocalOpportunityCandidate {
  return {
    pair: opp.pair,
    symbolA: opp.symbolA,
    symbolB: opp.symbolB,
    poolBuy: opp.buyPool,
    poolSell: opp.sellPool,
    dexBuy: opp.buyDex,
    dexSell: opp.sellDex,
    priceBuy: opp.buyPrice,
    priceSell: opp.sellPrice,
    spreadPct: opp.grossSpreadBps / 100,
    liquidity: Math.min(
      ...surfaceEngine.getSurface(opp.pair)?.pools
        .filter((p) => [opp.buyPool, opp.sellPool].includes(p.poolAddress))
        .map((p) => p.liquidity) || [0],
    ),
    confidence: opp.confidence,
    detectedAt: opp.detectedAt,
  };
}

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
    executableDetector.start();
    logInfo("GraphDetector: delegando a ExecutableDetector + SurfaceEngine");
  }

  scanGraph(): LocalOpportunityCandidate[] {
    this.lastScanTime = Date.now();
    this.totalScans++;

    if (!marketValidator.canEmitSignals()) return [];

    const executableOpps = executableDetector.scan();
    const found = executableOpps.map(oppToCandidate).filter((c) => isOpportunityValid(c).valid);

    this.candidates = found.slice(0, MAX_CANDIDATES);
    this.totalCandidates += found.length;

    if (found.length > 0) {
      logSuccess(`GraphDetector: ${found.length} oportunidad(es) — ${found[0].pair} spread=${found[0].spreadPct.toFixed(4)}%`);
    }

    if (this.totalScans % 5 === 0) {
      for (const label of priceGraph.getPairSurfaceLabels()) {
        surfaceEngine.printSurfaceReport(label);
      }
    }

    return this.candidates;
  }

  getCandidates(): LocalOpportunityCandidate[] {
    if (Date.now() - this.lastScanTime > CACHE_TTL_MS) return [];
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
    executableDetector.reset();
  }
}

export const graphDetector = new GraphDetector();

export async function detectOpportunities(config: BotConfig): Promise<LocalOpportunityCandidate[]> {
  return graphDetector.scanGraph();
}
