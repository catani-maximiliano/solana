import { PipelineLatency } from "./types";
import { latencyArbitrageProfiler } from "./latencyArbitrageProfiler";
import { eventLoopMonitor } from "./eventLoopMonitor";
import { regionOptimizer } from "./regionOptimizer";
import { preSignedTxCache } from "./preSignedTxCache";
import { hotRouteCache } from "./hotRouteCache";
import { latencySpikeDetector } from "./latencySpikeDetector";
import { logSuccess, logInfo } from "../../logger";

export class HftEngine {
  /** Record all latency metrics for a single execution cycle */
  recordExecutionCycle(
    ingestMs: number, decodeMs: number, graphMs: number,
    decisionMs: number, buildMs: number, serializationMs: number,
  ): void {
    latencyArbitrageProfiler.recordIngest(ingestMs);
    latencyArbitrageProfiler.recordDecode(decodeMs);
    latencyArbitrageProfiler.recordGraph(graphMs);
    latencyArbitrageProfiler.recordDecision(decisionMs);
    latencyArbitrageProfiler.recordBuild(buildMs);
    latencyArbitrageProfiler.recordSerialization(serializationMs);

    latencySpikeDetector.record("ingest", ingestMs);
    latencySpikeDetector.record("decode", decodeMs);
    latencySpikeDetector.record("graph", graphMs);
    latencySpikeDetector.record("decision", decisionMs);
    latencySpikeDetector.record("build", buildMs);
    latencySpikeDetector.record("serialization", serializationMs);

    eventLoopMonitor.tick();
  }

  /** Record relay latency for region optimization */
  recordRelayLatency(region: string, latencyMs: number): void {
    regionOptimizer.record(region, latencyMs);
    latencySpikeDetector.record("relay", latencyMs);
  }

  getPipelineLatency(): PipelineLatency { return latencyArbitrageProfiler.getPipelineLatency(); }

  /** Print HFT dashboard */
  printDashboard(): void {
    const lat = this.getPipelineLatency();
    const total = latencyArbitrageProfiler.getTotalMs();
    const spikes = latencySpikeDetector.getSpikeCount();

    logSuccess(`━━━━━━━━ [HFT ENGINE] ──────────`);
    logInfo(`Internal pipeline: ${total}ms (ingest=${lat.ingestMs}ms decode=${lat.decodeMs}ms graph=${lat.graphMs}ms decision=${lat.decisionMs}ms build=${lat.bundleBuildMs}ms serial=${lat.serializationMs}ms)`);
    logInfo(`Region ranking:`);
    regionOptimizer.printRanking();
    logInfo(`Pre-signed cache: ${preSignedTxCache.getSize()} entries`);
    logInfo(`Hot route cache: ${hotRouteCache.getSize()} routes`);
    logInfo(`Latency spikes detected: ${spikes}`);
    logInfo(`Slow event loop ticks: ${eventLoopMonitor.getSlowTickCount()}`);
    logSuccess(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  reset(): void {
    latencyArbitrageProfiler.reset();
    eventLoopMonitor.reset();
    regionOptimizer.reset();
    preSignedTxCache.reset();
    hotRouteCache.reset();
    latencySpikeDetector.reset();
  }
}

export const hftEngine = new HftEngine();
