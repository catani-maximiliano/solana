import { IntegrityDashboard } from "./types";
import { poolFreshnessTracker, PoolFreshnessTracker } from "./poolFreshnessTracker";
import { streamHeartbeatMonitor, StreamHeartbeatMonitor } from "./streamHeartbeatMonitor";
import { executionGraphFilter, ExecutionGraphFilter } from "./executionGraphFilter";
import { stalePoolKiller, StalePoolKiller } from "./stalePoolKiller";
import { corruptSnapshotDetector, CorruptSnapshotDetector } from "./corruptSnapshotDetector";
import { graphConsistencyValidator, GraphConsistencyValidator } from "./graphConsistencyValidator";
import { dexHealthMonitor, DexHealthMonitor } from "./dexHealthMonitor";
import { priceGraph } from "../../graph";
import { marketState, PoolStateSnapshot } from "../../market/state-cache";
import { logInfo, logWarning } from "../../logger";

export class IntegrityEngine {
  private running = false;
  private cycleCount = 0;
  private lastDashboardTime = 0;

  get poolFreshnessTracker(): PoolFreshnessTracker { return poolFreshnessTracker; }
  get streamHeartbeatMonitor(): StreamHeartbeatMonitor { return streamHeartbeatMonitor; }
  get executionGraphFilter(): ExecutionGraphFilter { return executionGraphFilter; }
  get stalePoolKiller(): StalePoolKiller { return stalePoolKiller; }
  get corruptSnapshotDetector(): CorruptSnapshotDetector { return corruptSnapshotDetector; }
  get graphConsistencyValidator(): GraphConsistencyValidator { return graphConsistencyValidator; }
  get dexHealthMonitor(): DexHealthMonitor { return dexHealthMonitor; }

  onPoolUpdate(snapshot: PoolStateSnapshot): void {
    if (!this.running) return;

    const currentSlot = this.getCurrentSlot();
    const ageMs = Date.now() - snapshot.timestamp;
    const sqrtNum = Number(BigInt(snapshot.sqrtPriceX64));
    const sqrtApprox = sqrtNum / 2 ** 64;
    const price = sqrtApprox * sqrtApprox * Math.pow(10, snapshot.decimalsA - snapshot.decimalsB);

    const isValid = !isNaN(price) && isFinite(price) && price > 0;

    poolFreshnessTracker.recordUpdate(
      snapshot.poolAddress,
      snapshot.dex,
      ageMs,
      snapshot.slot,
      currentSlot,
      isValid ? price : -1,
      Number(snapshot.liquidity),
    );

    if (isValid) {
      streamHeartbeatMonitor.recordEvent(snapshot.dex);
    } else {
      streamHeartbeatMonitor.recordDroppedEvent(snapshot.dex);
    }

    const corruptCheck = corruptSnapshotDetector.validate({
      poolAddress: snapshot.poolAddress,
      dex: snapshot.dex,
      sqrtPriceX64: snapshot.sqrtPriceX64,
      price,
      liquidity: Number(snapshot.liquidity),
      tick: snapshot.tick,
      slot: snapshot.slot,
      decimalsA: snapshot.decimalsA,
      decimalsB: snapshot.decimalsB,
    });

    if (!corruptCheck.valid) {
      poolFreshnessTracker.forceMarkCorrupt(snapshot.poolAddress, corruptCheck.reason || "corrupt snapshot");
      executionGraphFilter.compute();
    }
  }

  registerDex(dex: string, onReconnect?: () => void): void {
    streamHeartbeatMonitor.registerDex(dex, onReconnect);
  }

  cycle(): void {
    if (!this.running) return;
    this.cycleCount++;

    streamHeartbeatMonitor.checkHealth();

    const silentDexes = streamHeartbeatMonitor.getSilentDexes();
    for (const sd of silentDexes) {
      if (sd.silentMs > 5000) {
        stalePoolKiller.forceKillDexPools(sd.dex, `silent ${(sd.silentMs / 1000).toFixed(1)}s`);
      }
    }

    stalePoolKiller.check();

    executionGraphFilter.compute();

    graphConsistencyValidator.check();

    dexHealthMonitor.check();

    this.printDashboard();
  }

  onSnapshotReceived(snapshot: PoolStateSnapshot): void {
    if (!this.running) return;
    this.onPoolUpdate(snapshot);
  }

  private getCurrentSlot(): number {
    try {
      const wsManager = (global as any).wsManager;
      if (wsManager && typeof wsManager.getMetrics === "function") {
        return wsManager.getMetrics().lastSlot || 0;
      }
    } catch {
      // ignore
    }
    return 0;
  }

  start(): void {
    this.running = true;
    logInfo("[INTEGRITY] Engine started — fake alpha protection ACTIVE");
  }

  stop(): void {
    this.running = false;
    logInfo("[INTEGRITY] Engine stopped");
  }

  isRunning(): boolean {
    return this.running;
  }

  getDashboard(): IntegrityDashboard {
    const execCounters = executionGraphFilter.getCounters();
    const execEdges = executionGraphFilter.getExecutionEdgeCount();
    const dexScores = dexHealthMonitor.getAllScores();
    const poolStates = poolFreshnessTracker.getAllFreshness();
    const silentDexes = streamHeartbeatMonitor.getSilentDexes();
    const consistency = graphConsistencyValidator.check();

    return {
      executionGraph: {
        executableEdges: execEdges,
        staleRemoved: execCounters.staleRemoved,
        corruptRemoved: execCounters.corruptRemoved,
        deadRemoved: execCounters.deadRemoved,
      },
      dexHealth: dexScores,
      poolStates,
      heartbeat: {
        silentDexes: silentDexes.map((sd) => ({
          dex: sd.dex,
          silentMs: sd.silentMs,
          reconnecting: sd.reconnecting,
        })),
      },
      graphConsistency: {
        status: consistency.status,
        quarantinedPools: consistency.quarantinedPools,
        warnings: consistency.warnings,
      },
      fakeAlphaProtection: "ACTIVE",
    };
  }

  private printDashboard(): void {
    const now = Date.now();
    if (now - this.lastDashboardTime < 30000) return;
    this.lastDashboardTime = now;

    const d = this.getDashboard();

    logInfo("");
    logInfo("━━━━━━━━━━ [INTEGRITY ENGINE] ━━━━━━━━━━");
    logInfo("");
    logInfo("Execution graph:");
    logInfo(`  executable edges: ${d.executionGraph.executableEdges}`);
    logInfo(`  stale removed:    ${d.executionGraph.staleRemoved}`);
    logInfo(`  corrupt removed:  ${d.executionGraph.corruptRemoved}`);
    logInfo(`  dead removed:     ${d.executionGraph.deadRemoved}`);
    logInfo("");

    if (d.dexHealth.length > 0) {
      logInfo("DEX health:");
      for (const dh of d.dexHealth) {
        const icon = dh.state === "OK" ? "✅" : dh.state === "DEGRADED" ? "⚠️" : "❌";
        const note = dh.state === "DISABLED" ? " DISABLED" : "";
        logInfo(`  ${dh.dex.padEnd(18)} ${dh.score.toFixed(2)} ${icon}${note}`);
      }
      logInfo("");
    }

    const fresh = d.poolStates.filter((p) => p.state === "FRESH").length;
    const stale = d.poolStates.filter((p) => p.state === "STALE").length;
    const dead = d.poolStates.filter((p) => p.state === "DEAD").length;
    const corrupt = d.poolStates.filter((p) => p.state === "CORRUPT").length;
    logInfo("Pools:");
    logInfo(`  FRESH     ${fresh}`);
    logInfo(`  STALE     ${stale}`);
    logInfo(`  DEAD      ${dead}`);
    logInfo(`  CORRUPT   ${corrupt}`);
    logInfo("");

    if (d.heartbeat.silentDexes.length > 0) {
      logInfo("Heartbeat:");
      for (const sd of d.heartbeat.silentDexes) {
        logInfo(`  ${sd.dex} silent: ${(sd.silentMs / 1000).toFixed(1)}s${sd.reconnecting ? " (reconnecting...)" : ""}`);
      }
      logInfo("");
    }

    logInfo("Graph integrity:");
    logInfo(`  consistency: ${d.graphConsistency.status}`);
    logInfo(`  fake alpha protection: ${d.fakeAlphaProtection}`);
    logInfo("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    logInfo("");
  }

  clear(): void {
    poolFreshnessTracker.clear();
    streamHeartbeatMonitor.clear();
    executionGraphFilter.clear();
    stalePoolKiller.clear();
    corruptSnapshotDetector.clear();
    graphConsistencyValidator.clear();
    dexHealthMonitor.clear();
    this.cycleCount = 0;
    this.running = false;
    this.lastDashboardTime = 0;
  }
}

export const integrityEngine = new IntegrityEngine();
