import { NormalizedRealtimeEvent } from "../../streams/registry/eventTypes";
import { initEventRegistry, getRegistryState, printRegistryStatus } from "../../streams/registry/runtimeLoader";
import { registerEventHandler } from "../../streams/registry/eventRouter";
import { eventGraphEngine } from "./eventGraphEngine";
import { opportunityEngine } from "./opportunityEngine";
import { candidateEmitter } from "./candidateEmitter";
import { logInfo, logSuccess } from "../../logger";
import { flowEngine } from "../flow/flowEngine";
import { orderbookEngine } from "../orderbook/orderbookEngine";
import { predictiveEngine } from "../predictive/predictiveEngine";

let started = false;

/**
 * Start the event-driven engine:
 * 1. Register event handlers for each event kind
 * 2. Initialize the dynamic event registry (reads nln-events.txt)
 * 3. Start periodic health checks
 */
export function startEventDrivenEngine(): void {
  if (started) return;
  started = true;

  logInfo("[EVENT] starting event-driven arbitrage engine...");

  // ── Register SWAP handler: graph + flow + orderbook + predictive + opportunities
  registerEventHandler("SWAP", (event: NormalizedRealtimeEvent) => {
    eventGraphEngine.processSwap(event);
    flowEngine.process(event);
    orderbookEngine.processEvent(event);
    predictiveEngine.analyze(event.pool, event.pool, 0);

    const candidates = opportunityEngine.detect(event);
    for (const c of candidates) {
      candidateEmitter.emit(c);
      logInfo(`[EVENT] opportunity emitted: ${c.pair} net=+${c.netBps.toFixed(1)}bps`);
    }
  });

  // ── Register TRADED handler: graph + orderbook
  registerEventHandler("TRADED", (event: NormalizedRealtimeEvent) => {
    eventGraphEngine.processSwap(event);
    orderbookEngine.processEvent(event);
  });

  // ── Register ORDERBOOK handler: orderbook only
  registerEventHandler("ORDERBOOK", (event: NormalizedRealtimeEvent) => {
    orderbookEngine.processEvent(event);
  });

  // ── Register ROUTING handler: flow only
  registerEventHandler("ROUTING", (event: NormalizedRealtimeEvent) => {
    flowEngine.process(event);
  });

  // ── Initialize dynamic registry from nln-events.txt
  initEventRegistry();

  // ── Periodic health checks (every 30s)
  setInterval(() => {
    const gm = eventGraphEngine.getMetrics();
    const registry = getRegistryState();
    eventGraphEngine.printStreamHealth();
    printRegistryStatus();
    logInfo(`[EVENT] graph: ${gm.totalUpdates} updates (${gm.updatesPerSec}/s) | streams: ${registry.activeStreams}/${registry.topics.length}`);
  }, 30_000);

  logSuccess("[EVENT] Event-driven pipeline active");
}

export function stopEventDrivenEngine(): void {
  eventGraphEngine.reset();
  opportunityEngine.reset();
  candidateEmitter.reset();
  started = false;
}

export function getEventEngineStatus(): string {
  const gm = eventGraphEngine.getMetrics();
  const registry = getRegistryState();
  return `[EVENT] ${gm.updatesPerSec}ups ${gm.avgLatencyMs}ms | ${registry.activeStreams}/${registry.topics.length} streams`;
}
