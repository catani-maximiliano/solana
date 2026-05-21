import { DexHealthScore, PoolState } from "./types";
import { priceGraph } from "../../graph";
import { poolFreshnessTracker } from "./poolFreshnessTracker";
import { streamHeartbeatMonitor } from "./streamHeartbeatMonitor";
import { corruptSnapshotDetector } from "./corruptSnapshotDetector";
import { executionGraphBuilder } from "./executionGraphFilter";
import { logInfo, logWarning } from "../../logger";

const HEALTH_CHECK_INTERVAL_MS = 10000;
const SILENT_DISABLE_MS = 5000;
const STALE_RATIO_QUARANTINE = 0.4;
const STALE_RATIO_DISABLE = 0.6;

export class DexHealthMonitor {
  private lastCheck = 0;
  private scores = new Map<string, DexHealthScore>();
  private disabledDexes = new Set<string>();
  private quarantinedDexes = new Set<string>();

  check(): DexHealthScore[] {
    const now = Date.now();
    if (now - this.lastCheck < HEALTH_CHECK_INTERVAL_MS) {
      return this.getAllScores();
    }
    this.lastCheck = now;

    const knownDexes = this.discoverDexes();
    const results: DexHealthScore[] = [];

    for (const dex of knownDexes) {
      const score = this.computeDexScore(dex);
      const staleRatio = poolFreshnessTracker.getStaleRatio(dex);
      const streamHealth = streamHeartbeatMonitor.getDexHealth(dex);
      const silentMs = streamHealth?.silentDurationMs ?? 0;

      // Hard rules
      let state: "OK" | "DEGRADED" | "DISABLED" = "OK";

      if (silentMs > SILENT_DISABLE_MS || staleRatio >= STALE_RATIO_DISABLE) {
        state = "DISABLED";
        this.disabledDexes.add(dex);
        if (silentMs > SILENT_DISABLE_MS) {
          logWarning(`[DEX] ${dex} DISABLED no events ${(silentMs / 1000).toFixed(1)}s`);
        }
        if (staleRatio >= STALE_RATIO_DISABLE) {
          logWarning(`[DEX] ${dex} DISABLED staleRatio=${(staleRatio * 100).toFixed(0)}%`);
        }
      } else if (staleRatio >= STALE_RATIO_QUARANTINE) {
        state = "DEGRADED";
        this.quarantinedDexes.add(dex);
        logWarning(`[DEX] ${dex} QUARANTINED staleRatio=${(staleRatio * 100).toFixed(0)}%`);
      } else {
        this.disabledDexes.delete(dex);
        this.quarantinedDexes.delete(dex);
      }

      const s: DexHealthScore = {
        dex, score, state,
        freshnessRate: 1 - staleRatio,
        corruptionRate: 0,
        reconnectRate: 0,
        eventQuality: score,
        trackedPools: 0,
        activePools: 0,
      };

      this.scores.set(dex, s);
      results.push(s);
    }

    return results;
  }

  private discoverDexes(): string[] {
    const dexSet = new Set<string>();
    for (const f of poolFreshnessTracker.getAllFreshness()) dexSet.add(f.dex);
    for (const h of streamHeartbeatMonitor.getAllDexHealth()) dexSet.add(h.dex);
    for (const e of executionGraphBuilder.getExecutionEdges()) dexSet.add(e.dex);
    return Array.from(dexSet);
  }

  private computeDexScore(dex: string): number {
    const streamHealth = streamHeartbeatMonitor.getDexHealth(dex);
    if (!streamHealth) return 0;

    let score = 0;
    const epsScore = Math.min(1, streamHealth.eventsPerSec / 10) * 0.25;
    score += epsScore;

    const silentScore = streamHealth.silentDurationMs < 1000 ? 0.25
      : streamHealth.silentDurationMs < 3000 ? 0.15
      : streamHealth.silentDurationMs < 5000 ? 0.05
      : 0;
    score += silentScore;

    const reconnectPenalty = Math.min(1, streamHealth.reconnectCount / 5) * 0.15;
    score += (1 - reconnectPenalty) * 0.15;

    const staleRatio = poolFreshnessTracker.getStaleRatio(dex);
    score += (1 - staleRatio) * 0.25;

    const recentCorrupt = corruptSnapshotDetector.getRecentCorruptPools();
    const dexCorruptCount = recentCorrupt.filter((addr) => {
      const f = poolFreshnessTracker.getFreshness(addr);
      return f?.dex === dex;
    }).length;
    const corruptPenalty = Math.min(1, dexCorruptCount / 5) * 0.10;
    score -= corruptPenalty;

    const freshCount = poolFreshnessTracker.getAllFreshness().filter((f) => f.dex === dex && f.state === PoolState.FRESH).length;
    const freshnessBonus = Math.min(1, freshCount / 5) * 0.10;
    score += freshnessBonus;

    score = Math.max(0, Math.min(1, score));
    return Math.round(score * 100) / 100;
  }

  isDexEnabled(dex: string): boolean {
    if (this.disabledDexes.has(dex)) return false;
    return true;
  }

  isDexHealthy(dex: string): boolean {
    const s = this.scores.get(dex);
    if (!s) return true;
    if (s.state === "DISABLED") return false;
    if (s.state === "DEGRADED") return false;
    return true;
  }

  getDexScore(dex: string): number {
    return this.scores.get(dex)?.score ?? 0;
  }

  getAllScores(): DexHealthScore[] {
    return Array.from(this.scores.values());
  }

  getDisabledDexes(): string[] {
    return Array.from(this.disabledDexes);
  }

  getQuarantinedDexes(): string[] {
    return Array.from(this.quarantinedDexes);
  }

  logHealth(): void {
    const scores = this.check();
    for (const s of scores) {
      const icon = s.state === "OK" ? "✅" : s.state === "DEGRADED" ? "⚠️" : "❌";
      const note = s.state === "DISABLED" ? " DISABLED" : s.state === "DEGRADED" ? " QUARANTINED" : "";
      logInfo(`[DEX_HEALTH] ${icon} ${s.dex} health=${s.score.toFixed(2)}${note}`);
    }
  }

  clear(): void {
    this.scores.clear();
    this.disabledDexes.clear();
    this.quarantinedDexes.clear();
    this.lastCheck = 0;
  }
}

export const dexHealthMonitor = new DexHealthMonitor();
