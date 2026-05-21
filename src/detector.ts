import { BotConfig } from "./config";
import { logInfo, logSuccess, logWarning } from "./logger";
import { marketValidator } from "./market-validator";
import { executableDetector, surfaceEngine, pathBuilder, ExecutableOpportunity } from "./engine";
import { priceGraph } from "./graph";
import { integrityEngine } from "./core/integrity";

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

/** HIGH-QUALITY GATES for micro-capital validation */
const HQ_NET_BPS_MIN = 5;
const HQ_REALITY_SCORE_MIN = 60;
const HQ_LANDING_PROB_MIN = 0.60;
const HQ_CONFIDENCE_MIN = 0.70;

function oppToCandidate(opp: ExecutableOpportunity): LocalOpportunityCandidate {
  const isTri = opp.pair.includes("→");
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
    spreadPct: isTri ? opp.netSpreadBps / 100 : opp.grossSpreadBps / 100,
    liquidity: 100_000_000,
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

  // ═══ HIGH-QUALITY GATES in MICRO_CAPITAL mode ═══
  const { liveMode, microCapitalMode } = require("./config").config;
  if (liveMode || microCapitalMode) {
    if (opp.confidence < HQ_CONFIDENCE_MIN) {
      return { valid: false, reason: `HQ: confianza ${(opp.confidence * 100).toFixed(0)}% < ${(HQ_CONFIDENCE_MIN * 100).toFixed(0)}%` };
    }
    // netBps check from executable opportunity fields
    const execOpp = executableDetector.getOpportunities().find(e => e.pair === opp.pair);
    if (execOpp) {
      if (execOpp.netSpreadBps < HQ_NET_BPS_MIN) {
        return { valid: false, reason: `HQ: net ${execOpp.netSpreadBps.toFixed(1)}bps < ${HQ_NET_BPS_MIN}bps` };
      }
      if (execOpp.confidence < HQ_CONFIDENCE_MIN) {
        return { valid: false, reason: `HQ: exec conf ${(execOpp.confidence * 100).toFixed(0)}% < ${(HQ_CONFIDENCE_MIN * 100).toFixed(0)}%` };
      }
    }
  }

  return { valid: true };
}

class GraphDetector {
  private lastScanTime = 0;
  private candidates: LocalOpportunityCandidate[] = [];
  private totalScans = 0;
  private totalCandidates = 0;
  private lastHeartbeat = 0;

  start(): void {
    executableDetector.start();
    logInfo("GraphDetector: delegando a ExecutableDetector + PathBuilder + SurfaceEngine");
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

    if (this.totalScans % 10 === 0 || Date.now() - this.lastHeartbeat > 30000) {
      this.printHeartbeat();
      this.lastHeartbeat = Date.now();
    }

    return this.candidates;
  }

  private printHeartbeat(): void {
    const uptimeSec = Math.max(1, 1);
    const scansPerSec = (this.totalScans / uptimeSec).toFixed(2);
    const pathsPerSec = (this.totalCandidates / uptimeSec).toFixed(4);
    const triRes = executableDetector.getTriangularResult();
    const edgeCount = priceGraph.getValidEdgeCount();
    const nodeCount = priceGraph.getNodeCount();
    const activeOpps = executableDetector.getOpportunities();

    logSuccess("══════════ DETECTOR HEARTBEAT ════════");
    logInfo(`Detector: ACTIVE`);
    logInfo(`Scans/sec: ${scansPerSec}`);
    logInfo(`Paths/sec: ${pathsPerSec}`);
    logInfo(`Routes: ${triRes?.paths?.length || 0} triangular, ${Math.max(0, activeOpps.length - (triRes?.paths?.length || 0))} direct`);
    logInfo(`Candidates: ${this.totalCandidates}`);
    logInfo(`Executable: ${this.candidates.length}`);
    logInfo(`Rejected: ${this.totalScans - this.candidates.length}`);
    logInfo(`  stale: ${triRes?.rejectedStale || 0}`);
    logInfo(`  low liquidity: ${triRes?.rejectedSlippage || 0}`);
    logInfo(`  fees: ${triRes?.rejectedFees || 0}`);
    logInfo(`  disconnected: ${triRes?.rejectedDisconnected || 0}`);
    logInfo(`  duplicate: ${triRes?.rejectedDuplicate || 0}`);
    logInfo(`Graph: ${nodeCount} nodes, ${edgeCount} edges`);
    logSuccess("═══════════════════════════════════════");

    if (this.candidates.length > 0) {
      const bestOpp = this.candidates.reduce((a, b) => a.confidence > b.confidence ? a : b);
      logSuccess("══════════ SESSION METRICS ════════");
      logInfo(`Scans: ${this.totalScans}`);
      logInfo(`Cycles: ${triRes?.cyclesFound || 0}`);
      logInfo(`Candidates: ${this.totalCandidates}`);
      logInfo(`Executable: ${this.candidates.length}`);
      logInfo(`Best: ${bestOpp.pair} spread=${bestOpp.spreadPct.toFixed(4)}%`);
      logInfo(`Realtime graph health: ${edgeCount > 0 && nodeCount > 2 ? "100%" : "0%"}`);
      logSuccess("═════════════════════════════════════");
    } else {
      logWarning(`Session: ${this.totalScans} scans, ${triRes?.cyclesFound || 0} cycles, 0 executable — graph needs more liquidity`);
    }
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
