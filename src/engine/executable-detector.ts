import { priceGraph } from "../graph";
import { surfaceEngine } from "./market-surface-engine";
import { spreadEngine, MultiHopCandidate } from "./spread-engine";
import { slippageEstimator } from "./slippage-estimator";
import { edgeQualityScorer } from "./edge-quality";
import { spreadPersistence } from "./spread-persistence";
import { microstructure } from "./microstructure";
import { pathBuilder, bestEdgeSelector } from "./path-builder";
import { ExecutableOpportunity, TradePath, calculateFreshnessScore, calculateLatencyRisk } from "./types";
import { logSuccess, logInfo, logWarning, logDebug } from "../logger";
import { eventBus } from "../events";
import { marketValidator } from "../market-validator";
import { profitLedger } from "./profit-ledger";
import { paperExecution } from "./paper-execution";
import { integrityEngine } from "../core/integrity";
import { config } from "../config";
import { poolHealthTracker } from "../core/market/pool-health";

const MIN_NET_SPREAD_BPS = 0.3;
const MAX_CANDIDATES = 20;
const DETECTION_COOLDOWN_MS = 1_000;
const MIN_CONFIDENCE = 0.25;
const MAX_SLOT_LAG = 15;
const STALE_AGE_MS = 8_000;
const SOL_PRICE_USD = 160;
const PERSISTENCE_WINDOW_MS = 1_500;
const SIMULATED_LATENCY_MS = 2_000;
const SLIPPAGE_DECAY_PER_SEC = 0.3;
const WARMUP_MS = 45_000;

// Per-DEX max age limits
const DEX_MAX_AGE: Record<string, number> = {
  Whirlpool: 5000,
  "Raydium CLMM": 3000,
  Raydium: 3000,
  Meteora: 3000,
};
const STARTUP_TIME = Date.now();

export class ExecutableDetector {
  private opportunities: ExecutableOpportunity[] = [];
  private detectedKeys = new Set<string>();
  private lastDetectionTime = 0;
  private totalScans = 0;
  private totalOpportunities = 0;
  private lastTriangularResult = { paths: [], totalExplored: 0, cyclesFound: 0, rejectedStale: 0, rejectedFees: 0, rejectedSlippage: 0, rejectedDisconnected: 0, rejectedDuplicate: 0, executionTimeMs: 0 } as any;
  private triangularScanCounter = 0;
  private rejectedMultiHopCount = 0;
  private multiHopRejectReasons: string[] = [];
  private routeFirstSeen = new Map<string, number>(); // route → first detection timestamp
  private opportunityFingerprints = new Map<string, number>(); // fingerprint → timestamp (TTL cache)
  private duplicateOpportunitiesSuppressed = 0;

  /** Check if an opportunity fingerprint was recently emitted */
  private isDuplicateOpportunity(fingerprint: string, ttlMs = 5_000): boolean {
    const last = this.opportunityFingerprints.get(fingerprint);
    const now = Date.now();
    if (last && now - last < ttlMs) {
      this.duplicateOpportunitiesSuppressed++;
      return true;
    }
    this.opportunityFingerprints.set(fingerprint, now);
    // Clean stale entries
    if (this.opportunityFingerprints.size > 100) {
      for (const [k, v] of this.opportunityFingerprints) {
        if (now - v > 10_000) this.opportunityFingerprints.delete(k);
      }
    }
    return false;
  }

  /** Days since route was first seen (persistence) */
  private getRouteAge(route: string, now: number): number {
    const first = this.routeFirstSeen.get(route);
    return first ? now - first : 0;
  }

  /** Compute latency-adjusted net: subtract estimated slippage decay */
  private latencyAdjustedNet(netBps: number, routeAge: number): { adjustedNet: number; decayBps: number } {
    // After SIMULATED_LATENCY_MS, additional slippage may occur
    const latencySec = SIMULATED_LATENCY_MS / 1000;
    const decayBps = netBps * SLIPPAGE_DECAY_PER_SEC * latencySec;
    return { adjustedNet: Math.max(0, netBps - decayBps), decayBps };
  }

  start(): void {
    eventBus.subscribe("pool:update", () => {
      surfaceEngine.invalidateCache();
      this.scan();
    });
    logInfo("ExecutableDetector: event-driven — escuchando pool:update + scanning triangular routes");
  }

  scan(): ExecutableOpportunity[] {
    const now = Date.now();
    if (now - this.lastDetectionTime < DETECTION_COOLDOWN_MS) return [];
    this.lastDetectionTime = now;
    this.totalScans++;

    // Warmup phase: no executable promotion during bootstrap
    if (now - STARTUP_TIME < WARMUP_MS) {
      logDebug(`Executable: warmup ${(now - STARTUP_TIME) / 1000}s/${WARMUP_MS / 1000}s — skipping promotion`);
      return [];
    }

    // Clear previous detection keys so fresh opportunities aren't blocked
    this.detectedKeys.clear();

    if (!marketValidator.canEmitSignals()) return [];

    const found: ExecutableOpportunity[] = [];
    this.rejectedMultiHopCount = 0;
    this.multiHopRejectReasons = [];

    // ── Direct pair cross-DEX detection ──
    const labels = priceGraph.getPairSurfaceLabels();
    for (const label of labels) {
      const report = surfaceEngine.getSurface(label);
      if (!report || report.pools.length < 2) continue;

      // Dynamic minimum gross spread check
      if (report.spreadBps < report.requiredGrossBps) {
        logDebug(`Executable: SKIPPED_LOW_EDGE ${label} — gross ${report.spreadBps.toFixed(1)}bps < required ${report.requiredGrossBps.toFixed(1)}bps (fees+slip+safety)`);
        continue;
      }
      if (report.executableSpreadBps < MIN_NET_SPREAD_BPS) continue;

      // ═══ INTEGRITY HARD GATES — reject entire pair if any pool fails ═══
      const execGraph = integrityEngine.executionGraphBuilder;
      const integ = integrityEngine.spreadIntegrityValidator;

      // Ensure execution graph has been computed
      if (execGraph.getExecutionEdgeCount() === 0) {
        logDebug(`Executable: SKIP ${label} — execution graph empty`);
        continue;
      }

      // Per-DEX age limits for all pools in this surface
      let allFresh = true;
      for (const p of report.pools) {
        const maxAge = DEX_MAX_AGE[p.dex] ?? 5000;
        if (p.age > maxAge) {
          logDebug(`Executable: SKIP ${label} — ${p.dex} pool aged ${(p.age / 1000).toFixed(1)}s > ${maxAge}ms limit`);
          allFresh = false;
          break;
        }
      }
      if (!allFresh) continue;

      for (let i = 0; i < report.pools.length; i++) {
        for (let j = i + 1; j < report.pools.length; j++) {
          const a = report.pools[i];
          const b = report.pools[j];
          const buy = a.price < b.price ? a : b;
          const sell = a.price < b.price ? b : a;

          if (buy.age > STALE_AGE_MS || sell.age > STALE_AGE_MS) {
            logDebug(`[STALE_ALPHA] ${label} — buy age=${(buy.age / 1000).toFixed(1)}s sell age=${(sell.age / 1000).toFixed(1)}s > ${STALE_AGE_MS}ms`);
            continue;
          }
          if (Math.abs(buy.slot - sell.slot) > MAX_SLOT_LAG) {
            logDebug(`[STALE_ALPHA] ${label} — slotΔ=${Math.abs(buy.slot - sell.slot)} > ${MAX_SLOT_LAG}`);
            continue;
          }

          // ═══ INTEGRITY HARD GATE: both pools must be in execution graph ═══
          if (!execGraph.hasExecutionEdge(buy.poolAddress)) {
            logDebug(`Executable: SKIP ${label} — buy pool ${buy.poolAddress.substring(0, 8)}... not in execution graph`);
            continue;
          }
          if (!execGraph.hasExecutionEdge(sell.poolAddress)) {
            logDebug(`Executable: SKIP ${label} — sell pool ${sell.poolAddress.substring(0, 8)}... not in execution graph`);
            continue;
          }

          // ═══ SPREAD INTEGRITY VALIDATION === same-dex + freshness + slot + confidence ═══
          const integValid = integ.validate(
            { poolAddress: buy.poolAddress, dex: buy.dex, price: buy.price, liquidity: buy.liquidity, ageMs: buy.age, slotDelta: Math.abs(buy.slot - sell.slot), slot: buy.slot },
            { poolAddress: sell.poolAddress, dex: sell.dex, price: sell.price, liquidity: sell.liquidity, ageMs: sell.age, slotDelta: Math.abs(buy.slot - sell.slot), slot: sell.slot },
          );
          if (!integValid.valid) {
            logDebug(`Executable: SKIP ${label} — integrity fail: ${integValid.reason}`);
            continue;
          }

          // ═══ POOL HEALTH GATE — reject if any pool is auto-disabled ═══
          if (config.enablePoolHealthSystem) {
            if (poolHealthTracker.isDisabled(buy.poolAddress)) {
              logDebug(`[STALE_ALPHA] SKIP ${label} — buy pool ${buy.poolAddress.substring(0, 8)}... disabled: ${poolHealthTracker.getDisableReason(buy.poolAddress)}`);
              continue;
            }
            if (poolHealthTracker.isDisabled(sell.poolAddress)) {
              logDebug(`[STALE_ALPHA] SKIP ${label} — sell pool ${sell.poolAddress.substring(0, 8)}... disabled: ${poolHealthTracker.getDisableReason(sell.poolAddress)}`);
              continue;
            }
            if (!poolHealthTracker.isHealthy(buy.poolAddress)) {
              logDebug(`[STALE_ALPHA] SKIP ${label} — buy pool ${buy.poolAddress.substring(0, 8)}... unhealthy`);
              continue;
            }
            if (!poolHealthTracker.isHealthy(sell.poolAddress)) {
              logDebug(`[STALE_ALPHA] SKIP ${label} — sell pool ${sell.poolAddress.substring(0, 8)}... unhealthy`);
              continue;
            }
          }

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
          logInfo(`[REAL_ALPHA] CANDIDATE ${label} ${buy.dex}→${sell.dex} net=+${netSpreadBps.toFixed(2)}bps profit=$${optimal.netProfit.toFixed(4)} conf=${(confidence * 100).toFixed(0)}%`);
        }
      }
    }

    // ── Multi-hop candidates from spreadEngine (every scan) ──
    const multiHopCandidates = (config.liveMode || config.microCapitalMode || !config.enableMultiHop)
      ? [] : spreadEngine.getMultiHopCandidates();
    logDebug(`Executable: ${multiHopCandidates.length} multi-hop candidates received`);
    if (multiHopCandidates.length > 0) {
      for (const mh of multiHopCandidates) {
        logDebug(`  MH candidate: ${mh.symbols} net=${mh.netBps.toFixed(2)}bps profit=$${mh.profitUsd.toFixed(4)} hops=${mh.steps.length}`);
      }
    }
    for (const mh of multiHopCandidates) {
      if (mh.netBps < MIN_NET_SPREAD_BPS) {
        this.multiHopRejectReasons.push(`mh:${mh.symbols} net=${mh.netBps.toFixed(2)}bps < min=${MIN_NET_SPREAD_BPS}bps`);
        continue;
      }
      if (mh.steps.length < 2) {
        this.multiHopRejectReasons.push(`mh:${mh.symbols} steps=${mh.steps.length} < 2`);
        continue;
      }

      // Atomic execution validation: all hops must be VALID + FRESH
      let atomicValid = true;
      const hopErrors: string[] = [];
      for (const step of mh.steps) {
        const edge = priceGraph.getDirectPrice(step.fromToken, step.toToken);
        if (!edge) {
          hopErrors.push(`${step.fromSymbol}→${step.toSymbol}: no edge`);
          logDebug(`  MH hop FAIL: ${step.fromSymbol}→${step.toSymbol} — no edge in graph`);
          atomicValid = false;
          continue;
        }
        if (edge.health !== "VALID") {
          hopErrors.push(`${step.fromSymbol}→${step.toSymbol}: health=${edge.health}`);
          logDebug(`  MH hop FAIL: ${step.fromSymbol}→${step.toSymbol} — health=${edge.health} (need VALID)`);
          atomicValid = false;
          continue;
        }
        const age = Date.now() - edge.timestamp;
        if (age > 30000) {
          hopErrors.push(`${step.fromSymbol}→${step.toSymbol}: stale ${(age/1000).toFixed(0)}s`);
          logDebug(`  MH hop FAIL: ${step.fromSymbol}→${step.toSymbol} — age=${(age/1000).toFixed(0)}s > 30s`);
          atomicValid = false;
          continue;
        }
        // Check reverse edge exists for multi-hop continuity
        const revEdge = priceGraph.getDirectPrice(step.toToken, step.fromToken);
        if (!revEdge) {
          hopErrors.push(`${step.fromSymbol}→${step.toSymbol}: no reverse edge`);
          logDebug(`  MH hop FAIL: ${step.fromSymbol}→${step.toSymbol} — reverse edge missing`);
          atomicValid = false;
          continue;
        }
        logDebug(`  MH hop OK: ${step.fromSymbol}→${step.toSymbol} — ${edge.dex} health=${edge.health} age=${(age/1000).toFixed(1)}s`);
      }

      if (!atomicValid) {
        this.multiHopRejectReasons.push(`mh:${mh.symbols} atomic FAIL — ${hopErrors.join("; ")}`);
        this.rejectedMultiHopCount++;
        continue;
      }

      // Persistence tracking: first time we see this route
      const routeKey = mh.route;
      const now = Date.now();
      if (!this.routeFirstSeen.has(routeKey)) {
        this.routeFirstSeen.set(routeKey, now);
        logDebug(`MH persistence: ${mh.symbols} first seen`);
      }
      const age = this.getRouteAge(routeKey, now);

      // Persistence filter: must survive minimum window
      if (age < PERSISTENCE_WINDOW_MS) {
        this.multiHopRejectReasons.push(`mh:${mh.symbols} age=${(age/1000).toFixed(1)}s < persistence=${PERSISTENCE_WINDOW_MS/1000}s`);
        logDebug(`MH PERSISTENCE WAIT: ${mh.symbols} age=${(age/1000).toFixed(1)}s/${PERSISTENCE_WINDOW_MS/1000}s`);
        this.rejectedMultiHopCount++;
        continue;
      }

      // Latency-adjusted net
      const { adjustedNet, decayBps } = this.latencyAdjustedNet(mh.netBps, age);
      if (adjustedNet < MIN_NET_SPREAD_BPS) {
        this.multiHopRejectReasons.push(`mh:${mh.symbols} latency-adjusted net=${adjustedNet.toFixed(2)}bps < min`);
        continue;
      }

      // Execution confidence score
      const conf = this.routeExecutionConfidence(mh);

      const oppKey = `mh:${mh.route}`;
      if (this.detectedKeys.has(oppKey)) continue;
      this.detectedKeys.add(oppKey);

      const firstStep = mh.steps[0];
      const lastStep = mh.steps[mh.steps.length - 1];

      // Build execution plan with step-by-step breakdown
      const executionSteps = mh.steps.map((s, i) => ({
        hopIndex: i,
        fromToken: s.fromToken,
        toToken: s.toToken,
        fromSymbol: s.fromSymbol,
        toSymbol: s.toSymbol,
        poolAddress: s.poolAddress,
        dex: s.dex,
        inputAmount: s.inputAmount,
        outputAmount: s.outputAmount,
        feePaid: s.feeAmount,
        feeBps: s.feeBps,
        slippageBps: s.slippageBps,
        priceBefore: s.price,
        priceAfter: s.price * (1 - s.slippageBps / 10000),
      }));

      const executionPlan = {
        route: mh.route,
        inputToken: firstStep.fromToken,
        outputToken: lastStep.toToken,
        inputAmount: mh.inputUsd,
        outputAmount: mh.inputUsd * (1 + mh.netBps / 10000),
        steps: executionSteps,
        cumulativeFeeBps: mh.feesBps,
        cumulativeSlippageBps: mh.slippageBps,
        netBps: mh.netBps,
        profitUsd: mh.profitUsd,
        hopCount: mh.hopCount,
      };

      const opp: ExecutableOpportunity = {
        pair: mh.symbols,
        symbolA: firstStep.fromSymbol,
        symbolB: lastStep.toSymbol,
        buyPool: firstStep.poolAddress,
        sellPool: lastStep.poolAddress,
        buyDex: firstStep.dex,
        sellDex: lastStep.dex,
        buyPrice: firstStep.price,
        sellPrice: lastStep.price,
        grossSpreadBps: mh.grossBps,
        netSpreadBps: adjustedNet,
        feesBps: mh.feesBps,
        slippageBps: mh.slippageBps,
        impactBps: mh.slippageBps,
        estimatedProfitUsd: mh.profitUsd * (1 - decayBps / 100),
        estimatedProfitSol: mh.inputUsd * (1 + mh.netBps / 10000) - mh.inputUsd,
        totalFees: 0,
        slippageCost: 0,
        impactCost: mh.slippageBps,
        executableSize: mh.inputUsd,
        optimalSize: mh.inputUsd,
        liquidityConfidence: conf,
        confidence: conf,
        latencyRisk: "MEDIUM",
        freshnessScore: 0.5,
        persistenceMs: 0,
        qualityScore: conf,
        detectedAt: Date.now(),
        executionPlan,
      };

      // Fingerprint dedup: same route + similar netBps + same DEXes within 5s window
      const oppFp = `${mh.symbols}|${Math.round(adjustedNet)}|${firstStep?.dex || ""}|${lastStep?.dex || ""}`;
      if (this.isDuplicateOpportunity(oppFp)) {
        logDebug(`Executable: SKIP duplicate opportunity ${mh.symbols} net=${adjustedNet.toFixed(1)}bps`);
        continue;
      }

      logInfo(`[REAL_ALPHA] PROMOTED multi-hop ${mh.symbols} net=+${adjustedNet.toFixed(2)}bps (raw=+${mh.netBps.toFixed(2)}bps latency-decay=${decayBps.toFixed(1)}bps) profit=$${(mh.profitUsd * (1 - decayBps / 100)).toFixed(4)} conf=${(conf * 100).toFixed(0)}% age=${(age/1000).toFixed(1)}s`);
      // Register for paper execution replay
      paperExecution.registerExecutable(
        mh.symbols,
        mh.steps.map(s => ({ from: s.fromToken, to: s.toToken })),
        adjustedNet,
        mh.profitUsd * (1 - decayBps / 100),
        mh.inputUsd,
        firstStep?.fromToken || "",
        lastStep?.toToken || "",
      );
      profitLedger.record({
        timestamp: Date.now(),
        route: mh.symbols,
        type: "multi_hop",
        inputUsd: mh.inputUsd,
        outputUsd: mh.inputUsd + mh.profitUsd,
        grossBps: mh.grossBps,
        feesBps: mh.feesBps,
        slippageBps: mh.slippageBps,
        netBps: mh.netBps,
        netUsd: mh.profitUsd,
        status: "EXECUTABLE",
        confidence: conf,
        buyDex: firstStep?.dex || "",
        sellDex: lastStep?.dex || "",
        latencyMs: 0,
      });
      found.push(opp);
    }

    // ── Multi-hop promotion invariant ──
    // If a route has net > 0 but wasn't promoted, ensure it was logged
    if (multiHopCandidates.some(mh => mh.netBps > 0) && found.length === multiHopCandidates.filter(mh => mh.netBps > 0).length) {
      logDebug(`Executable: all ${multiHopCandidates.filter(mh => mh.netBps > 0).length} profitable multi-hop route(s) successfully promoted`);
    }

    // ── Triangular path detection (disabled in LIVE/MICRO_CAPITAL mode) ──
    if (config.liveMode || config.microCapitalMode) {
      this.triangularScanCounter = 0;
    } else {
      this.triangularScanCounter++;
    }
    if (this.triangularScanCounter > 0 && this.triangularScanCounter % 3 === 0) {
      const triResult = pathBuilder.enumerateTriangularPaths();
      this.lastTriangularResult = triResult;

      for (const tp of triResult.paths) {
        const routeSymbols = tp.pathSymbols;
        if (routeSymbols.length < 2) continue;

        const oppKey = `tri:${tp.routeLabel}`;
        if (this.detectedKeys.has(oppKey)) continue;
        this.detectedKeys.add(oppKey);

        const hop = tp.hops[0];
        const lastHop = tp.hops[tp.hops.length - 1];
        const conf = Math.min(1, tp.confidence);

        const opp: ExecutableOpportunity = {
          pair: tp.routeLabel,
          symbolA: routeSymbols[0],
          symbolB: routeSymbols[routeSymbols.length - 1],
          buyPool: hop.poolAddress,
          sellPool: lastHop.poolAddress,
          buyDex: hop.dex,
          sellDex: lastHop.dex,
          buyPrice: hop.price,
          sellPrice: lastHop.price,
          grossSpreadBps: tp.grossSpreadBps,
          netSpreadBps: tp.netSpreadBps,
          feesBps: tp.totalFeeBps,
          slippageBps: tp.totalSlippageBps,
          impactBps: tp.totalSlippageBps,
          estimatedProfitUsd: tp.estimatedProfitUsd,
          estimatedProfitSol: tp.optimalSizeSol,
          totalFees: 0,
          slippageCost: 0,
          impactCost: tp.totalSlippageBps,
          executableSize: tp.optimalSizeSol,
          optimalSize: tp.optimalSizeSol,
          liquidityConfidence: conf,
          confidence: conf,
          latencyRisk: "MEDIUM",
          freshnessScore: 0.5,
          persistenceMs: 0,
          qualityScore: conf,
          detectedAt: Date.now(),
        };

        found.push(opp);
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
    const profitScore = Math.min(1, opp.estimatedProfitUsd / 0.1);
    const confidenceScore = opp.confidence;
    const freshnessScore = opp.freshnessScore;
    const qualityScore = opp.qualityScore;
    const latencyScore = opp.latencyRisk === "LOW" ? 1 : opp.latencyRisk === "MEDIUM" ? 0.5 : 0;
    const persistScore = Math.min(1, opp.persistenceMs / 2000);

    // Persistent spreads > 15bps get a big boost
    const grossBoost = opp.grossSpreadBps > 15 ? Math.min(1, (opp.grossSpreadBps - 15) / 20) * 0.15 : 0;

    return (
      profitScore * 0.25 +
      confidenceScore * 0.15 +
      freshnessScore * 0.12 +
      qualityScore * 0.12 +
      latencyScore * 0.08 +
      persistScore * 0.13 +
      grossBoost
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

  /** Route execution confidence: 0-1 score based on hop quality, freshness, stability */
  private routeExecutionConfidence(mh: import("./spread-engine").MultiHopCandidate): number {
    let score = 0.30; // base
    if (mh.profitUsd > 0.01) score += 0.15;
    if (mh.profitUsd > 0.05) score += 0.10;
    if (mh.netBps > 10) score += 0.10;
    if (mh.hopCount <= 3) score += 0.05; // shorter routes = higher confidence
    if (mh.steps.every((s) => s.slippageBps < 10)) score += 0.10; // low slippage
    if (mh.steps.every((s) => s.feeBps <= 25)) score += 0.10; // low fees
    // Freshness bonus: all steps must be recent
    const allFresh = mh.steps.every((s) => {
      const edge = priceGraph.getDirectPrice(s.fromToken, s.toToken);
      return edge && (Date.now() - edge.timestamp) < 30000;
    });
    if (allFresh) score += 0.10;
    return Math.min(1, score);
  }

  getTriangularResult() { return this.lastTriangularResult; }

  private liveSpreadCountdown = 0;
  private healthCountdown = 0;

  private logSummary(): void {
    this.liveSpreadCountdown++;
    this.healthCountdown++;

    if (this.opportunities.length > 0) {
      logSuccess("══════════ EXECUTABLE OPPORTUNITIES ══════════");
      for (const opp of this.opportunities) {
        const isTri = opp.pair.includes("→");
        if (isTri) {
          const plan = opp.executionPlan;
          logSuccess(`🔺 ${opp.pair}`);
          if (plan) {
            for (const step of plan.steps) {
              const arrow = step.outputAmount >= step.inputAmount ? "→" : "→";
              logInfo(`    ${step.hopIndex + 1}. ${step.fromSymbol} ${arrow} ${step.toSymbol} | ${step.dex} | ${step.inputAmount.toFixed(6)} → ${step.outputAmount.toFixed(6)} | fee: -${step.feeBps}bps | slip: -${step.slippageBps}bps`);
            }
          }
          logInfo(`  Gross: +${opp.grossSpreadBps.toFixed(2)} bps | Fees: -${opp.feesBps.toFixed(2)} bps | Slip: -${opp.slippageBps.toFixed(2)} bps | Net: ${opp.netSpreadBps.toFixed(2)} bps`);
          logInfo(`  Size: ${opp.optimalSize.toFixed(3)} SOL | Profit: $${opp.estimatedProfitUsd.toFixed(4)} | Conf: ${(opp.confidence * 100).toFixed(0)}%`);
          logInfo(`  Executable: ${opp.netSpreadBps > 0.5 ? "YES" : "NO"}`);
        } else {
          const netBps = opp.netSpreadBps.toFixed(2);
          const grossBps = opp.grossSpreadBps.toFixed(2);
          logSuccess(`  ${opp.pair}`);
          logInfo(`    buy:  ${opp.buyDex} @ $${opp.buyPrice.toFixed(6)}`);
          logInfo(`    sell: ${opp.sellDex} @ $${opp.sellPrice.toFixed(6)}`);
          logInfo(`    gross: ${grossBps} bps | net: ${netBps} bps | profit: $${opp.estimatedProfitUsd.toFixed(4)}`);
        }
      }
      logSuccess("══════════════════════════════════════════════");
    }

    // ── Multi-hop rejection debug when no candidates ──
    if (this.opportunities.length === 0 && this.multiHopRejectReasons.length > 0) {
      logInfo("");
      logInfo(`  ⏸ MULTI-HOP REJECTED: ${this.rejectedMultiHopCount} route(s) failed atomic validation`);
      for (const reason of this.multiHopRejectReasons.slice(0, 5)) {
        logInfo(`     ${reason}`);
      }
    }

    if (this.liveSpreadCountdown % 5 === 0) {
      this.logLiveSpreads();
    }
    if (this.healthCountdown % 15 === 0) {
      this.logPairHealthReport();
    }
  }

  private logOpportunities(): void { }

  logLiveSpreads(): void {
    const labels = priceGraph.getPairSurfaceLabels();
    if (labels.length === 0) return;

    logSuccess("══════════════ LIVE SPREADS ══════════════");
    const spreadRows: { pair: string; spreadBps: number }[] = [];

    for (const label of labels) {
      const surface = priceGraph.getMarketSurface(label);
      if (!surface || surface.validCount < 2) {
        logInfo(`${label}: < 2 valid pools`);
        continue;
      }

      const spreadBps = surface.spreadRange;
      spreadRows.push({ pair: label, spreadBps });

      const bestAskPool = surface.pools.find((p) => p.price === surface.bestAsk);
      const bestBidPool = surface.pools.find((p) => p.price === surface.bestBid);
      const buyDex = bestAskPool?.dex ?? "?";
      const sellDex = bestBidPool?.dex ?? "?";
      const grossUsd = (surface.bestBid - surface.bestAsk) * 0.01;
      const avgFee = surface.pools.filter((p) => p.health === "VALID" && p.price > 0)
        .reduce((s, p) => s + p.fee, 0) / Math.max(1, surface.validCount);
      const netBps = Math.max(0, spreadBps - avgFee * 2);

      logInfo(`${label}:`);
      logInfo(`  BUY:  ${buyDex} @ $${surface.bestAsk.toFixed(6)}`);
      logInfo(`  SELL: ${sellDex} @ $${surface.bestBid.toFixed(6)}`);
      logInfo(`  Spread: +${spreadBps.toFixed(2)} bps`);
      logInfo(`  Gross: +$${grossUsd.toFixed(4)}  Fees: -${avgFee.toFixed(2)} bps  Net: +${netBps.toFixed(2)} bps`);
      logInfo(`  Executable: ${netBps > 0.5 ? "YES" : "NO"}`);
    }

    if (spreadRows.length > 0) {
      spreadRows.sort((a, b) => b.spreadBps - a.spreadBps);
      const best = spreadRows[0];
      logInfo(`Best: ${best.pair} +${best.spreadBps.toFixed(2)}bps`);
    }
    logSuccess("══════════════════════════════════════════════════");
  }

  logPairHealthReport(): void {
    const labels = priceGraph.getPairSurfaceLabels();
    if (labels.length === 0) return;

    logSuccess("══════════════ PAIR HEALTH ══════════════");
    for (const label of labels) {
      const surface = priceGraph.getMarketSurface(label);
      if (!surface || surface.totalCount === 0) {
        logInfo(`${label}: NO_UPDATES`);
        continue;
      }
      const valid = surface.pools.filter((p) => p.health === "VALID");
      const stale = surface.pools.filter((p) => p.health === "STALE" || p.age > 10000);
      const corrupted = surface.pools.filter((p) => p.health === "CORRUPTED" || p.health === "INVALID");
      const lowLiq = surface.pools.filter((p) => p.health === "LOW_LIQUIDITY");

      let status = "ACTIVE";
      if (corrupted.length > 0) status = "CORRUPTED";
      else if (stale.length > valid.length) status = "STALE";
      else if (lowLiq.length > valid.length) status = "LOW_LIQUIDITY";
      else if (valid.length === 0) status = "NO_UPDATES";

      logInfo(`${label}: ${status} (${valid.length} valid, ${stale.length} stale, ${corrupted.length} corrupted)`);
    }
    logSuccess("═════════════════════════════════════════");
  }

  getOpportunities(): ExecutableOpportunity[] { return this.opportunities; }

  getStats() {
    return {
      totalScans: this.totalScans,
      totalOpportunities: this.totalOpportunities,
      activeCandidates: this.opportunities.length,
      detectedKeys: this.detectedKeys.size,
      triangularCycles: this.lastTriangularResult.cyclesFound || 0,
      triangularPaths: this.lastTriangularResult.paths?.length || 0,
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
    pathBuilder.reset();
  }
}

export const executableDetector = new ExecutableDetector();
