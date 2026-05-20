import { parseEventFile, watchEventFile } from "./eventParser";
import { streamFactory } from "./dynamicStreamFactory";
import { routeEvent } from "./eventRouter";
import { TopicConfig, RegistryState } from "./eventTypes";
import { logInfo, logSuccess, logWarning } from "../../logger";

const API_KEY = process.env.SOLANA_API_KEY || "sk_live_WyFos0McoGTo53GhVpaDXqS9FYT0QuZy";

let currentTopics: TopicConfig[] = [];
let eventTimestamps: number[] = [];

/** Initialize the event registry: parse file + create streams + wire router */
export function initEventRegistry(): void {
  currentTopics = parseEventFile();
  logInfo(`[NLN-REGISTRY] loaded ${currentTopics.length} topics from nln-events.txt`);

  // Wire router to factory
  streamFactory.on("event", (event) => {
    routeEvent(event);
    eventTimestamps.push(Date.now());
    if (eventTimestamps.length > 1000) eventTimestamps.shift();
  });

  // Create streams
  for (const cfg of currentTopics) {
    streamFactory.createStream(cfg, API_KEY);
  }

  // Watch for changes (hot reload)
  const unwatch = watchEventFile((newTopics) => {
    logInfo(`[NLN-REGISTRY] hot reload detected: ${newTopics.length} topics`);
    const oldTopics = new Set(currentTopics.map(t => t.topic));
    const newTopicSet = new Set(newTopics.map(t => t.topic));

    // Add new streams
    for (const cfg of newTopics) {
      if (!oldTopics.has(cfg.topic)) {
        logInfo(`[NLN-REGISTRY] new topic: ${cfg.topic}`);
        streamFactory.createStream(cfg, API_KEY);
      }
    }

    // Remove deleted streams
    for (const old of currentTopics) {
      if (!newTopicSet.has(old.topic)) {
        logInfo(`[NLN-REGISTRY] removed topic: ${old.topic}`);
        streamFactory.removeStream(old.topic);
      }
    }

    currentTopics = newTopics;
  });

  logSuccess(`[NLN-REGISTRY] initialized: ${currentTopics.length} topics, ${streamFactory.getStreamCount()} streams`);
}

/** Get current registry state */
export function getRegistryState(): RegistryState {
  const now = Date.now();
  const recent = eventTimestamps.filter(t => now - t < 10000);
  return {
    topics: currentTopics,
    activeStreams: streamFactory.getActiveCount(),
    totalEvents: streamFactory.getTotalEvents(),
    eventsPerSec: Math.round((recent.length / 10) * 10) / 10,
  };
}

/** Print registry dashboard */
export function printRegistryStatus(): void {
  const state = getRegistryState();
  logInfo(`━━━━━━━━ [NLN-REGISTRY] ──────────`);
  logInfo(`Topics: ${state.topics.length} | Streams: ${state.activeStreams}/${state.topics.length}`);
  logInfo(`Events: ${state.totalEvents} | EPS: ${state.eventsPerSec}`);
  for (const t of state.topics) {
    logInfo(`  ${t.dex.padEnd(14)} ${t.eventType.padEnd(8)} ${t.topic}`);
  }
  logInfo(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}
