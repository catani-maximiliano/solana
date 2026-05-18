import { marketState } from "./market";
import { priceGraph } from "./graph";
import { logWarning, logInfo, logDebug } from "./logger";

export type ProviderState = "STARTING" | "HEALTHY" | "DEGRADED" | "RECOVERING" | "FAILED" | "SHUTDOWN";

export interface ProviderHealth {
  name: string;
  state: ProviderState;
  lastOk: number;
  failures: number;
  recoveryAttempts: number;
  parseFailures: number;
  successfulParses: number;
  trackedPools: number;
  lastUpdate: number;
}

export interface MarketHealth {
  pools: number;
  pairs: number;
  providers: ProviderHealth[];
  subscriptions: number;
  lastUpdate: number;
  stale: boolean;
  totalUpdates: number;
  activeDexes: string[];
}

export type SignalQuality = "REAL" | "DEGRADED" | "FALLBACK_ONLY" | "BLOCKED";

export class MarketValidator {
  private providers = new Map<string, ProviderHealth>();
  private lastValidData = 0;
  private staleThresholdMs = 60_000;

  registerProvider(name: string): void {
    if (!this.providers.has(name)) {
      this.providers.set(name, {
        name,
        state: "STARTING",
        lastOk: 0,
        failures: 0,
        recoveryAttempts: 0,
        parseFailures: 0,
        successfulParses: 0,
        trackedPools: 0,
        lastUpdate: 0,
      });
    }
  }

  setProviderState(name: string, state: ProviderState): void {
    const p = this.providers.get(name);
    if (!p) return;
    const old = p.state;
    p.state = state;
    if (state === "HEALTHY") { p.lastOk = Date.now(); p.failures = 0; }
    if (state === "FAILED" || state === "DEGRADED") p.failures++;
    if (state === "RECOVERING") p.recoveryAttempts++;
    if (old !== state) {
      logDebug(`Provider ${name}: ${old} → ${state}`);
    }
  }

  updateProviderMetrics(name: string, metrics: { parseFailures?: number; successfulParses?: number; trackedPools?: number; lastUpdate?: number }): void {
    const p = this.providers.get(name);
    if (!p) return;
    if (metrics.parseFailures !== undefined) p.parseFailures = metrics.parseFailures;
    if (metrics.successfulParses !== undefined) p.successfulParses = metrics.successfulParses;
    if (metrics.trackedPools !== undefined) p.trackedPools = metrics.trackedPools;
    if (metrics.lastUpdate !== undefined) p.lastUpdate = metrics.lastUpdate;
  }

  getProviderState(name: string): ProviderState {
    return this.providers.get(name)?.state || "FAILED";
  }

  recordValidData(): void {
    this.lastValidData = Date.now();
  }

  getHealth(): MarketHealth {
    const now = Date.now();
    const pools = marketState.getPoolCount();
    const pairs = marketState.getPairCount();
    const stats = marketState.getStats();

    return {
      pools,
      pairs,
      providers: Array.from(this.providers.values()),
      subscriptions: 0,
      lastUpdate: this.lastValidData,
      stale: pools === 0 || now - this.lastValidData > this.staleThresholdMs,
      totalUpdates: stats.updates,
      activeDexes: marketState.getActiveDexes(),
    };
  }

  getSignalQuality(): SignalQuality {
    const health = this.getHealth();

    if (health.pools === 0 && health.pairs === 0) {
      const anyHealthy = health.providers.some((p) => p.state === "HEALTHY");
      if (!anyHealthy) return "BLOCKED";
      return "FALLBACK_ONLY";
    }

    const healthyProviders = health.providers.filter((p) => p.state === "HEALTHY").length;
    if (healthyProviders === 0) return "FALLBACK_ONLY";
    if (healthyProviders >= 1 && health.pools >= 1) return "REAL";
    return "DEGRADED";
  }

  canEmitSignals(): boolean {
    const quality = this.getSignalQuality();
    if (quality === "BLOCKED") return false;
    if (quality === "FALLBACK_ONLY") {
      return this.getHealth().pools > 0 || this.getHealth().pairs > 0;
    }
    return true;
  }

  getSystemMode(): string {
    const quality = this.getSignalQuality();
    switch (quality) {
      case "REAL": return "✅ ON-CHAIN DATA ACTIVE";
      case "DEGRADED": return "⚠️ ON-CHAIN DATA DEGRADED";
      case "FALLBACK_ONLY": return "🔶 FALLBACK ONLY — Sin datos on-chain reales";
      case "BLOCKED": return "🔴 SIGNALS BLOCKED — Sin market data válida";
    }
  }

  printStatus(): void {
    const health = this.getHealth();
    const quality = this.getSignalQuality();
    const mode = this.getSystemMode();
    const stats = marketState.getStats();
    const graphNodes = priceGraph.getNodeCount();
    const graphEdges = priceGraph.getEdgeCount();

    console.log(`\n╔══════════════════════════════════════════╗`);
    console.log(`║   SYSTEM STATUS                         ║`);
    console.log(`╚══════════════════════════════════════════╝`);
    console.log(`  Mode:          ${mode}`);
    console.log(`  Pools:         ${health.pools}`);
    console.log(`  Pairs:         ${health.pairs}`);
    console.log(`  Graph nodes:   ${graphNodes}`);
    console.log(`  Graph edges:   ${graphEdges}`);
    console.log(`  Total updates: ${stats.updates}`);
    console.log(`  Active DEXes:  ${health.activeDexes.length > 0 ? health.activeDexes.join(", ") : "none"}`);
    console.log(`  Uptime:        ${Math.floor(stats.uptime / 1000)}s`);
    console.log(`  Last data:     ${health.lastUpdate ? new Date(health.lastUpdate).toISOString().substring(11, 19) : "N/A"}`);
    console.log(`  Stale:         ${health.stale ? "YES" : "NO"}`);
    console.log(`  Can signal:    ${this.canEmitSignals() ? "YES" : "NO"}`);
    console.log(`  Slot warns:    ${stats.slotWarnings}`);
    console.log(`  Stale cleanup: ${stats.staleCleanups}`);

    for (const p of health.providers) {
      const icon = p.state === "HEALTHY" ? "✅" : p.state === "DEGRADED" ? "⚠️" : p.state === "RECOVERING" ? "🔄" : p.state === "STARTING" ? "⏳" : "❌";
      console.log(`  ${icon} ${p.name}: ${p.state}`);
      console.log(`     pools: ${p.trackedPools} | parse OK: ${p.successfulParses} | FAIL: ${p.parseFailures} | last: ${p.lastUpdate ? new Date(p.lastUpdate).toISOString().substring(11, 19) : "never"}`);
    }
    console.log(``);
  }
}

export const marketValidator = new MarketValidator();
