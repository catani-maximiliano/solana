import { IntegrityDashboard, LiveValidationStats, ExecutionRecord } from "./types";
import { poolFreshnessTracker, PoolFreshnessTracker } from "./poolFreshnessTracker";
import { streamHeartbeatMonitor, StreamHeartbeatMonitor } from "./streamHeartbeatMonitor";
import { executionGraphBuilder, ExecutionGraphBuilder } from "./executionGraphFilter";
import { stalePoolKiller, StalePoolKiller } from "./stalePoolKiller";
import { corruptSnapshotDetector, CorruptSnapshotDetector } from "./corruptSnapshotDetector";
import { graphConsistencyValidator, GraphConsistencyValidator } from "./graphConsistencyValidator";
import { dexHealthMonitor, DexHealthMonitor } from "./dexHealthMonitor";
import { sameDexGuard } from "./sameDexGuard";
import { confidenceSanitizer } from "./confidenceSanitizer";
import { spreadIntegrityValidator } from "./spreadIntegrityValidator";
import { poolHealthTracker } from "../market/pool-health";
import { priceGraph } from "../../graph";
import { marketState, PoolStateSnapshot } from "../../market/state-cache";
import { logInfo, logWarning, logSuccess } from "../../logger";

export class IntegrityEngine {
  private running = false;
  private cycleCount = 0;
  private lastDashboardTime = 0;

  // ═══ LIVE VALIDATION STATS ═══
  private executionRecords: ExecutionRecord[] = [];
  private liveValidationStats: LiveValidationStats = {
    totalTrades: 0,
    wins: 0,
    losses: 0,
    totalPnlSol: 0,
    totalAlphaDetectedBps: 0,
    totalAlphaCapturedBps: 0,
    latencyBps: 0,
    slippageBps: 0,
    bundleLossBps: 0,
    bundleWinCount: 0,
    bundleLossCount: 0,
  };

  recordRealExecution(record: ExecutionRecord): void {
    this.executionRecords.push(record);
    this.liveValidationStats.totalTrades++;
    if (record.success) {
      this.liveValidationStats.wins++;
    } else {
      this.liveValidationStats.losses++;
    }
    this.liveValidationStats.totalPnlSol += record.pnlSol;
    if (record.alphaDetectedBps) this.liveValidationStats.totalAlphaDetectedBps += record.alphaDetectedBps;
    if (record.alphaCapturedBps) this.liveValidationStats.totalAlphaCapturedBps += record.alphaCapturedBps;
    if (record.success) {
      this.liveValidationStats.bundleWinCount++;
    } else {
      this.liveValidationStats.bundleLossCount++;
    }
  }

  getLiveValidationStats(): LiveValidationStats {
    return { ...this.liveValidationStats };
  }

  get poolFreshnessTracker() { return poolFreshnessTracker; }
  get streamHeartbeatMonitor() { return streamHeartbeatMonitor; }
  get executionGraphBuilder() { return executionGraphBuilder; }
  get stalePoolKiller() { return stalePoolKiller; }
  get corruptSnapshotDetector() { return corruptSnapshotDetector; }
  get graphConsistencyValidator() { return graphConsistencyValidator; }
  get dexHealthMonitor() { return dexHealthMonitor; }
  get sameDexGuard() { return sameDexGuard; }
  get confidenceSanitizer() { return confidenceSanitizer; }
  get spreadIntegrityValidator() { return spreadIntegrityValidator; }

  onSnapshotReceived(snapshot: PoolStateSnapshot): void {
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
      poolFreshnessTracker.forceMarkCorrupt(snapshot.poolAddress, corruptCheck.reason || "corrupt");
      executionGraphBuilder.compute();
    }
  }

  registerDex(dex: string, onReconnect?: () => void): void {
    streamHeartbeatMonitor.registerDex(dex, onReconnect);
  }

  cycle(): void {
    if (!this.running) return;
    this.cycleCount++;

    // 1. Check stream heartbeats
    streamHeartbeatMonitor.checkHealth();

    // 2. Kill stale pools from silent DEXes
    const silentDexes = streamHeartbeatMonitor.getSilentDexes();
    for (const sd of silentDexes) {
      if (sd.silentMs > 5000) {
        stalePoolKiller.forceKillDexPools(sd.dex, `silent ${(sd.silentMs / 1000).toFixed(1)}s`);
      }
    }

    // 3. Run stale pool killer
    stalePoolKiller.check();

    // 4. Check DEX health (auto-disable at 5s silence, quarantine at 40% stale)
    dexHealthMonitor.check();

    // 5. Rebuild execution graph with all rejections
    executionGraphBuilder.compute();

    // 6. Check graph consistency
    graphConsistencyValidator.check();

    // 7. Print dashboard
    this.printDashboard();
  }

  start(): void {
    this.running = true;
    logInfo("[INTEGRITY] Engine started — fake alpha protection ACTIVE");
  }

  stop(): void {
    this.running = false;
    logInfo("[INTEGRITY] Engine stopped");
  }

  isRunning(): boolean { return this.running; }

  getDashboard(): IntegrityDashboard {
    const execCounters = executionGraphBuilder.getRejectCounts();
    const execEdges = executionGraphBuilder.getExecutionEdgeCount();
    const dexScores = dexHealthMonitor.getAllScores();
    const poolStates = poolFreshnessTracker.getAllFreshness();
    const silentDexes = streamHeartbeatMonitor.getSilentDexes();
    const consistency = graphConsistencyValidator.check();
    const disabledDexes = dexHealthMonitor.getDisabledDexes();

    return {
      executionGraph: {
        executableEdges: execEdges,
        staleRemoved: execCounters.stale,
        corruptRemoved: execCounters.corrupt,
        deadRemoved: execCounters.dead,
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

  private getCurrentSlot(): number {
    try {
      const wsManager = (global as any).wsManager;
      if (wsManager && typeof wsManager.getMetrics === "function") {
        return wsManager.getMetrics().lastSlot || 0;
      }
    } catch { /* ignore */ }
    return 0;
  }

  private printDashboard(): void {
    const now = Date.now();
    if (now - this.lastDashboardTime < 30000) return;
    this.lastDashboardTime = now;

    const d = this.getDashboard();
    const reject = executionGraphBuilder.getRejectCounts();
    const nodeCount = priceGraph.getNodeCount();
    const edgeCount = executionGraphBuilder.getExecutionEdgeCount();
    const pairs = executionGraphBuilder.getPairLabels();

    const fresh = poolFreshnessTracker.getFreshCount();
    const stale = poolFreshnessTracker.getStaleCount();
    const dead = poolFreshnessTracker.getDeadCount();
    const corrupt = poolFreshnessTracker.getCorruptCount();

    logInfo("");
    logInfo("━━━━━━━━ [INTEGRITY ENGINE] ━━━━━━━━");
    logInfo("");
    logInfo("Execution graph:");
    logInfo(`  nodes=${nodeCount}`);
    logInfo(`  edges=${edgeCount}`);
    logInfo(`  pairs=${pairs.length} [${pairs.join(", ")}]`);

    if (d.dexHealth.length > 0) {
      logInfo("");
      logInfo("Dex health:");
      for (const dh of d.dexHealth) {
        const icon = dh.state === "OK" ? "✅" : dh.state === "DEGRADED" ? "⚠️" : "❌";
        const note = dh.state === "DISABLED" ? " DISABLED" : "";
        logInfo(`  ${dh.dex.padEnd(18)} ${icon}${note}`);
      }
    }

    logInfo("");
    logInfo("Integrity rejects:");
    logInfo(`  stale=${reject.stale}  slot=${reject.slot}  sameDex=${reject.sameDex}  invalidPrice=${reject.invalidPrice}  corrupt=${reject.corrupt}  dead=${reject.dead}`);

    logInfo("");
    logInfo("Executable-grade candidates:");
    logInfo(`  fresh=${fresh}  stale=${stale}  dead=${dead}  corrupt=${corrupt}`);

    if (d.graphConsistency.warnings.length > 0) {
      logInfo("");
      logInfo("Warnings:");
      for (const w of d.graphConsistency.warnings) logInfo(`  ⚠ ${w}`);
    }

    // ═══ LIVE VALIDATION DASHBOARD ═══
    if (this.liveValidationStats.totalTrades > 0) {
      const s = this.liveValidationStats;
      const winRate = s.totalTrades > 0 ? (s.wins / s.totalTrades) * 100 : 0;
      const captureRate = s.totalAlphaDetectedBps > 0 ? (s.totalAlphaCapturedBps / s.totalAlphaDetectedBps) * 100 : 0;
      const landingRate = s.totalTrades > 0 ? (s.wins / s.totalTrades) * 100 : 0;
      const bundleWinRate = (s.bundleWinCount + s.bundleLossCount) > 0 ? (s.bundleWinCount / (s.bundleWinCount + s.bundleLossCount)) * 100 : 0;

      logInfo("");
      logSuccess("━━━━━━━━ [LIVE VALIDATION] ━━━━━━━━");
      logInfo(`  Real trades:       ${s.totalTrades}`);
      logInfo(`  Win rate:          ${winRate.toFixed(1)}% (${s.wins}W / ${s.losses}L)`);
      logInfo(`  Capture rate:      ${captureRate.toFixed(1)}%`);
      logInfo(`  PnL realized:      ${s.totalPnlSol >= 0 ? "+" : ""}${s.totalPnlSol.toFixed(8)} SOL`);
      logInfo(`  Alpha detected:    ${s.totalAlphaDetectedBps.toFixed(1)}bps`);
      logInfo(`  Alpha captured:    ${s.totalAlphaCapturedBps.toFixed(1)}bps`);
      logInfo(`  Landing rate:      ${landingRate.toFixed(1)}%`);
      logInfo(`  Bundle win rate:   ${bundleWinRate.toFixed(1)}%`);
      logInfo(`  Latency leakage:   ${s.latencyBps.toFixed(2)}bps`);
      logInfo(`  Slippage leakage:  ${s.slippageBps.toFixed(2)}bps`);
      logInfo(`  Bundle loss:       ${s.bundleLossBps.toFixed(2)}bps`);
      logSuccess("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    }

    logInfo("");
    logInfo("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    logInfo("");
  }

  clear(): void {
    poolFreshnessTracker.clear();
    streamHeartbeatMonitor.clear();
    executionGraphBuilder.clear();
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
