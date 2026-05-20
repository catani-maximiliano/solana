import { priceGraph, PriceEdge } from "../graph";
import { logInfo, logSuccess } from "../logger";

const STALE_THRESHOLD_MS = 3_000;
const FRESH_THRESHOLD_MS = 1_000;
const SLOT_DIVERGENCE_THRESHOLD = 5;
const MIN_LIQUIDITY_USD = 1_000;

export interface LatencyArbSignal {
  pair: string;
  symbolA: string;
  symbolB: string;
  freshDex: string;
  freshPool: string;
  freshPrice: number;
  freshAgeMs: number;
  freshSlot: number;
  staleDex: string;
  stalePool: string;
  stalePrice: number;
  staleAgeMs: number;
  staleSlot: number;
  slotDelta: number;
  ageDeltaMs: number;
  staleGapBps: number;
  staleGapUsd: number;
  classification: "STALE_POOL" | "DELAYED_UPDATE" | "SLOT_DIVERGENCE" | "CROSS_DEX_DISLOCATION";
  severity: "LOW" | "MEDIUM" | "HIGH";
  persistenceMs: number;
  firstSeen: number;
}

export interface LatencyExecutableOpportunity {
  pair: string;
  freshDex: string;
  staleDex: string;
  expectedPnlBps: number;
  slotDelta: number;
  ageDeltaMs: number;
  executionConfidence: number;
  classification: LatencyArbSignal["classification"];
  severity: LatencyArbSignal["severity"];
}

export class LatencyArbDetector {
  private signals = new Map<string, LatencyArbSignal>();
  private executables = new Map<string, LatencyExecutableOpportunity>();

  private canonicalize(symA: string, symB: string): string {
    const canon = [symA, symB].sort().join("/");
    return `${canon}|${symA}→${symB}`;
  }

  private severityLabel(s: LatencyArbSignal): "LOW" | "MEDIUM" | "HIGH" {
    if (s.classification === "CROSS_DEX_DISLOCATION" && s.staleGapBps > 10) return "HIGH";
    if (s.slotDelta > 20) return "HIGH";
    if (s.ageDeltaMs > 10_000) return "HIGH";
    if (s.classification === "SLOT_DIVERGENCE" && s.staleGapBps > 5) return "MEDIUM";
    return s.severity;
  }

  scan(): LatencyArbSignal[] {
    const edges = priceGraph.getAllEdgesRaw();
    const now = Date.now();
    const found: LatencyArbSignal[] = [];

    const byPair = new Map<string, PriceEdge[]>();
    for (const e of edges) {
      const fromSym = priceGraph.mintToSymbol(e.from);
      const toSym = priceGraph.mintToSymbol(e.to);
      if (!fromSym || !toSym) continue;
      if (e.liquidity < MIN_LIQUIDITY_USD) continue;
      if (e.price <= 0) continue;
      if (e.slot <= 0) continue;
      if (e.health === "INVALID_SLOT") continue;
      const key = this.canonicalize(fromSym, toSym);
      if (!byPair.has(key)) byPair.set(key, []);
      byPair.get(key)!.push(e);
    }

    for (const [key, pairEdges] of byPair) {
      if (pairEdges.length < 2) continue;

      pairEdges.sort((a, b) => a.timestamp - b.timestamp);
      const fresh = pairEdges[pairEdges.length - 1];
      const oldest = pairEdges[0];
      const freshAge = now - fresh.timestamp;
      const staleAge = now - oldest.timestamp;
      const ageDelta = freshAge - staleAge; // negative when fresh is actually older (misleading)

      const freshSlot = fresh.slot || 0;
      const staleSlot = oldest.slot || 0;
      const slotDelta = Math.abs(freshSlot - staleSlot);

      const pairSym = key.split("|")[0];

      const staleGapBps = fresh.price > 0 ? Math.abs((oldest.price - fresh.price) / fresh.price) * 10000 : 0;
      const staleGapUsd = Math.abs(oldest.price - fresh.price);

      let classification: LatencyArbSignal["classification"];
      if (ageDelta < -STALE_THRESHOLD_MS && slotDelta > SLOT_DIVERGENCE_THRESHOLD) {
        classification = "DELAYED_UPDATE";
      } else if (slotDelta > SLOT_DIVERGENCE_THRESHOLD * 2) {
        classification = "SLOT_DIVERGENCE";
      } else if (staleAge > STALE_THRESHOLD_MS && freshAge < FRESH_THRESHOLD_MS) {
        classification = "CROSS_DEX_DISLOCATION";
      } else if (staleAge > STALE_THRESHOLD_MS) {
        classification = "STALE_POOL";
      } else continue;

      let severity: LatencyArbSignal["severity"] = "LOW";
      if (staleGapBps > 10 && staleAge > 10_000) severity = "HIGH";
      else if (staleGapBps > 3 || staleAge > 5_000) severity = "MEDIUM";

      const signalKey = `${pairSym}|${fresh.dex}vs${oldest.dex}`;
      const existing = this.signals.get(signalKey);
      const persistenceMs = existing ? now - existing.firstSeen : 0;
      const firstSeen = existing ? existing.firstSeen : now;

      const [symA, symB] = pairSym.split("/");
      const signal: LatencyArbSignal = {
        pair: pairSym,
        symbolA: symA,
        symbolB: symB,
        freshDex: fresh.dex,
        freshPool: fresh.poolAddress,
        freshPrice: fresh.price,
        freshAgeMs: freshAge,
        freshSlot,
        staleDex: oldest.dex,
        stalePool: oldest.poolAddress,
        stalePrice: oldest.price,
        staleAgeMs: staleAge,
        staleSlot,
        slotDelta,
        ageDeltaMs: Math.abs(ageDelta),
        staleGapBps,
        staleGapUsd,
        classification,
        severity,
        persistenceMs,
        firstSeen,
      };
      signal.severity = this.severityLabel(signal);

      this.signals.set(signalKey, signal);
      found.push(signal);
    }

    found.sort((a, b) => {
      const sev = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      return (sev[b.severity] - sev[a.severity]) || (b.slotDelta - a.slotDelta) || (b.staleGapBps - a.staleGapBps);
    });

    return found.slice(0, 10);
  }

  getSignals(): LatencyArbSignal[] {
    return Array.from(this.signals.values())
      .sort((a, b) => {
        const sev = { HIGH: 3, MEDIUM: 2, LOW: 1 };
        return (sev[b.severity] - sev[a.severity]) || (b.slotDelta - a.slotDelta);
      })
      .slice(0, 10);
  }

  generateExecutables(): LatencyExecutableOpportunity[] {
    const results: LatencyExecutableOpportunity[] = [];
    for (const [, s] of this.signals) {
      if (s.staleGapBps < 3) continue;
      if (s.slotDelta < SLOT_DIVERGENCE_THRESHOLD) continue;
      if (s.severity === "LOW") continue;

      const estimatedFeesBps = 10; // rough estimate for round-trip
      const expectedPnlBps = Math.max(0, s.staleGapBps - estimatedFeesBps);

      // Confidence: higher gap + higher slot divergence + longer persistence = higher confidence
      const gapScore = Math.min(1, s.staleGapBps / 20);
      const slotScore = Math.min(1, s.slotDelta / 20);
      const persistScore = Math.min(1, s.persistenceMs / 30_000);
      const executionConfidence = Math.min(1, (gapScore * 0.5 + slotScore * 0.3 + persistScore * 0.2));

      const key = `${s.pair}|${s.freshDex}vs${s.staleDex}`;
      const opp: LatencyExecutableOpportunity = {
        pair: s.pair,
        freshDex: s.freshDex,
        staleDex: s.staleDex,
        expectedPnlBps,
        slotDelta: s.slotDelta,
        ageDeltaMs: s.ageDeltaMs,
        executionConfidence,
        classification: s.classification,
        severity: s.severity,
      };
      this.executables.set(key, opp);
      results.push(opp);
    }
    results.sort((a, b) => b.expectedPnlBps - a.expectedPnlBps);
    return results.slice(0, 5);
  }

  getExecutables(): LatencyExecutableOpportunity[] {
    return Array.from(this.executables.values())
      .sort((a, b) => b.expectedPnlBps - a.expectedPnlBps)
      .slice(0, 5);
  }

  printReport(signals: LatencyArbSignal[]): void {
    if (signals.length === 0) {
      logInfo(`  (no latency arbitrage signals detected)`);
      return;
    }

    logSuccess("═══════════════════════════════════════════════════════════════════════════════════");
    logSuccess("⚡ LATENCY ARBITRAGE SIGNALS");
    logSuccess("═══════════════════════════════════════════════════════════════════════════════════");

    for (let i = 0; i < Math.min(signals.length, 5); i++) {
      const s = signals[i];
      const sevIcon = s.severity === "HIGH" ? "🔴" : s.severity === "MEDIUM" ? "🟡" : "🟢";
      logInfo(`  #${i + 1}  ${sevIcon} ${s.pair}`);
      logInfo(`       Fresh: ${s.freshDex} @ $${s.freshPrice.toFixed(6)}  age: ${s.freshAgeMs}ms  slot: ${s.freshSlot}`);
      logInfo(`       Stale: ${s.staleDex} @ $${s.stalePrice.toFixed(6)}  age: ${s.staleAgeMs}ms  slot: ${s.staleSlot}`);
      logInfo(`       Gap: +${s.staleGapBps.toFixed(2)} bps  |  Slot Δ: ${s.slotDelta}  |  Age Δ: ${s.ageDeltaMs}ms`);
      logInfo(`       Type: ${s.classification}  |  Persistence: ${(s.persistenceMs / 1000).toFixed(1)}s  |  Severity: ${s.severity}`);
    }
    logSuccess("═══════════════════════════════════════════════════════════════════════════════════");
  }

  reset(): void {
    this.signals.clear();
    this.executables.clear();
  }
}

export const latencyArbDetector = new LatencyArbDetector();
