import { NormalizedSwapEvent } from "../../streams/nolimitnode/types";
import { nlnStreamManager } from "../../streams/nolimitnode";
import { eventGraphEngine } from "./eventGraphEngine";
import { opportunityEngine } from "./opportunityEngine";
import { candidateEmitter } from "./candidateEmitter";
import { logInfo, logSuccess, logWarning, logDebug } from "../../logger";

let started = false;

/** Start the event-driven engine: connect NLN streams and wire processing pipeline */
export function startEventDrivenEngine(): void {
  if (started) return;
  started = true;

  logInfo("[EVENT] starting event-driven arbitrage engine...");

  // Wire NLN stream to graph engine
  nlnStreamManager.on("swap", (event: NormalizedSwapEvent) => {
    // 1. Update graph edge for this pool
    eventGraphEngine.processSwap(event);

    // 2. Detect opportunities triggered by this event
    const candidates = opportunityEngine.detect(event);

    // 3. Emit candidates
    for (const c of candidates) {
      candidateEmitter.emit(c);
    }
  });

  // Start NLN streams
  nlnStreamManager.subscribeAll().then(() => {
    logSuccess("[EVENT] NLN streams connected — event-driven pipeline active");
  });

  // Periodic health check (every 30s, not scanning)
  setInterval(() => {
    const graphMetrics = eventGraphEngine.getMetrics();
    const oppStats = opportunityEngine.getStats();
    logInfo(`[EVENT] graph: ${graphMetrics.totalUpdates} updates (${graphMetrics.updatesPerSec}/s) | ops: ${oppStats.totalCandidates}`);
    nlnStreamManager.checkStale();
  }, 30_000);
}

export function stopEventDrivenEngine(): void {
  nlnStreamManager.destroy();
  eventGraphEngine.reset();
  opportunityEngine.reset();
  candidateEmitter.reset();
  started = false;
}

export function getEventEngineStatus(): string {
  const gm = eventGraphEngine.getMetrics();
  return `[EVENT] ${gm.updatesPerSec}ups ${gm.avgLatencyMs}ms | ${opportunityEngine.getStats().totalCandidates} candidates`;
}
