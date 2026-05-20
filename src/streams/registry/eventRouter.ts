import { NormalizedRealtimeEvent, EventKind } from "./eventTypes";
import { logInfo, logDebug } from "../../logger";

type EventHandler = (event: NormalizedRealtimeEvent) => void;

const handlers = new Map<EventKind, EventHandler[]>();

export function registerEventHandler(kind: EventKind, handler: EventHandler): void {
  const list = handlers.get(kind) || [];
  list.push(handler);
  handlers.set(kind, list);
}

export function routeEvent(event: NormalizedRealtimeEvent): void {
  const list = handlers.get(event.eventKind) || [];
  for (const handler of list) {
    try {
      handler(event);
    } catch (err) {
      logDebug(`[NLN-ROUTER] handler error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  logDebug(`[NLN-ROUTER] ${event.eventKind} → ${list.length} handler(s)`);
}

export function getRegisteredKinds(): EventKind[] {
  return Array.from(handlers.keys());
}

export function resetRouters(): void {
  handlers.clear();
}
