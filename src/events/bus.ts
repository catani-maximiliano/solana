import { ArbEvent, EventType } from "./types";
import { logDebug } from "../logger";

type EventHandler = (event: ArbEvent) => void;

export class EventBus {
  private subscribers = new Map<EventType, Set<EventHandler>>();
  private history: ArbEvent[] = [];
  private readonly MAX_HISTORY = 1000;
  private handlerTimers = new Map<EventHandler, ReturnType<typeof setTimeout>>();

  subscribe(type: EventType, handler: EventHandler, debounceMs: number = 0): () => void {
    if (!this.subscribers.has(type)) this.subscribers.set(type, new Set());
    this.subscribers.get(type)!.add(handler);

    if (debounceMs > 0) {
      this.handlerTimers.set(handler, setTimeout(() => {}, 0));
    }

    return () => {
      this.subscribers.get(type)?.delete(handler);
      const timer = this.handlerTimers.get(handler);
      if (timer) clearTimeout(timer);
      this.handlerTimers.delete(handler);
    };
  }

  emit(event: ArbEvent): void {
    this.history.push(event);
    if (this.history.length > this.MAX_HISTORY) this.history.shift();

    const handlers = this.subscribers.get(event.type);
    if (!handlers || handlers.size === 0) return;

    for (const handler of handlers) {
      const timer = this.handlerTimers.get(handler);
      if (timer) {
        clearTimeout(timer);
        this.handlerTimers.set(handler, setTimeout(() => {
          try { handler(event); } catch (e) { logDebug(`Event handler error: ${e}`); }
        }, 0));
      } else {
        try { handler(event); } catch (e) { logDebug(`Event handler error: ${e}`); }
      }
    }
  }

  subscribeMultiple(types: EventType[], handler: EventHandler): () => void {
    const unsubs = types.map((t) => this.subscribe(t, handler));
    return () => unsubs.forEach((u) => u());
  }

  getHistory(type?: EventType, limit: number = 50): ArbEvent[] {
    const filtered = type ? this.history.filter((e) => e.type === type) : this.history;
    return filtered.slice(-limit);
  }

  getLastEvent(type: EventType): ArbEvent | undefined {
    return this.history.slice().reverse().find((e) => e.type === type);
  }

  clear(): void {
    this.subscribers.clear();
    this.history = [];
    for (const timer of this.handlerTimers.values()) clearTimeout(timer);
    this.handlerTimers.clear();
  }
}

export const eventBus = new EventBus();
