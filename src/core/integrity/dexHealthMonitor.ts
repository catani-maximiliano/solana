import { DexHealthScore, PoolState } from "./types";
import { priceGraph } from "../../graph";
import { poolFreshnessTracker } from "./poolFreshnessTracker";
import { streamHeartbeatMonitor } from "./streamHeartbeatMonitor";
import { corruptSnapshotDetector } from "./corruptSnapshotDetector";
import { executionGraphFilter } from "./executionGraphFilter";
import { logInfo, logWarning } from "../../logger";

const HEALTH_CHECK_INTERVAL_MS = 10000;
const DISABLE_THRESHOLD = 0.4;
const DEGRADE_THRESHOLD = 0.6;

export class DexHealthMonitor {
  private lastCheck = 0;
  private scores = new Map<string, DexHealthScore>();

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
      const state = score >= DISABLE_THRESHOLD
        ? score >= DEGRADE_THRESHOLD ? "OK" as const : "DEGRADED" as const
        : "DISABLED" as const;

      const s: DexHealthScore = {
        dex,
        score,
        state,
        freshnessRate: score,
        corruptionRate: 1 - score,
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

    for (const f of poolFreshnessTracker.getAllFreshness()) {
      dexSet.add(f.dex);
    }

    for (const h of streamHeartbeatMonitor.getAllDexHealth()) {
      dexSet.add(h.dex);
    }

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

    const freshnessEntries = poolFreshnessTracker.getAllFreshness().filter((f) => f.dex === dex);
    const total = freshnessEntries.length;
    if (total > 0) {
      const freshCount = freshnessEntries.filter((f) => f.state === PoolState.FRESH).length;
      const freshRatio = freshCount / total;
      score += freshRatio * 0.25;

      const corruptCount = freshnessEntries.filter((f) => f.state === PoolState.CORRUPT).length;
      const corruptPenalty = Math.min(1, corruptCount / Math.max(1, total)) * 0.10;
      score -= corruptPenalty;
    }

    const recentCorrupt = corruptSnapshotDetector.getRecentCorruptPools();
    const dexCorruptCount = recentCorrupt.filter((addr) => {
      const f = poolFreshnessTracker.getFreshness(addr);
      return f?.dex === dex;
    }).length;
    const corruptPenalty2 = Math.min(1, dexCorruptCount / 5) * 0.10;
    score -= corruptPenalty2;

    score = Math.max(0, Math.min(1, score));
    return Math.round(score * 100) / 100;
  }

  isDexEnabled(dex: string): boolean {
    const s = this.scores.get(dex);
    if (!s) return true;
    return s.score >= DISABLE_THRESHOLD;
  }

  getDexScore(dex: string): number {
    return this.scores.get(dex)?.score ?? 0;
  }

  getAllScores(): DexHealthScore[] {
    return Array.from(this.scores.values());
  }

  logHealth(): void {
    const scores = this.check();
    for (const s of scores) {
      const icon = s.state === "OK" ? "✅" : s.state === "DEGRADED" ? "⚠️" : "❌";
      const note = s.state === "DISABLED" ? " DISABLED" : "";
      logInfo(`[DEX_HEALTH] ${icon} ${s.dex} health=${s.score.toFixed(2)}${note}`);
    }
  }

  clear(): void {
    this.scores.clear();
    this.lastCheck = 0;
  }
}

export const dexHealthMonitor = new DexHealthMonitor();
