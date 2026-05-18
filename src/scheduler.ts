import { BotConfig } from "./config";
import { circuitBreaker } from "./circuit-breaker";
import { logDebug, logWarning, logInfo } from "./logger";
import { pairState } from "./pair-state";
import { marketState } from "./market";
import { eventBus, EventType } from "./events";
import { WebSocketManager } from "./ws/manager";

export interface EventPlan {
  poolsToCheck: string[];
  enabledPairs: Array<{ label: string; priority: number }>;
  useJupiterFallback: boolean;
  degradedMode: boolean;
}

export class EventScheduler {
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly DEBOUNCE_MS = 500;

  private lastScanTime = 0;
  private lastScanOpps = 0;
  private lastScanValid = 0;
  private consecutiveIdleScans = 0;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private readonly WATCHDOG_INTERVAL_MS = 15_000;
  private readonly IDLE_THRESHOLD = 5;
  private watchdogEnabled = false;
  private wsManager: WebSocketManager | null = null;

  enableWatchdog(wsManager?: WebSocketManager): void {
    if (this.watchdogEnabled) return;
    this.watchdogEnabled = true;
    this.wsManager = wsManager || null;
    this.watchdogTimer = setInterval(() => this.checkLiveness(), this.WATCHDOG_INTERVAL_MS);
    logDebug("EventScheduler: watchdog habilitado");
  }

  disableWatchdog(): void {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    this.watchdogEnabled = false;
  }

  recordScanComplete(timestamp: number, opps: number, valid: number): void {
    this.lastScanTime = timestamp;
    this.lastScanOpps = opps;
    this.lastScanValid = valid;

    if (opps === 0 && valid === 0) {
      this.consecutiveIdleScans++;
    } else {
      this.consecutiveIdleScans = 0;
    }
  }

  private checkLiveness(): void {
    const now = Date.now();
    const sinceLastScan = now - this.lastScanTime;

    if (this.lastScanTime === 0) return;

    if (sinceLastScan > this.WATCHDOG_INTERVAL_MS * 3) {
      logWarning(`Watchdog: ${sinceLastScan / 1000}s sin scan — posible bloqueo`);
      if (sinceLastScan > 60_000) {
        logWarning("Watchdog: detectando heartbeat muerto por > 60s — reinicio necesario");
      }
      return;
    }

    if (this.consecutiveIdleScans >= this.IDLE_THRESHOLD) {
      logWarning(`Watchdog: ${this.consecutiveIdleScans} scans consecutivos sin oportunidades — scheduler posiblemente idle`);
      const subs = this.wsManager ? this.wsManager.getSubscriptionsCount() : 0;
      logWarning(`Watchdog: pools=${marketState.getPoolCount()}, subs=${subs}, last=${new Date(this.lastScanTime).toISOString().substring(11, 19)}`);

      eventBus.emit({
        type: "provider:status_change" as EventType,
        timestamp: now,
        data: { provider: "scheduler", available: false, reason: "idle_detected" },
      });
    }
  }

  buildPlan(config: BotConfig): EventPlan {
    const degraded = circuitBreaker.isDegraded();

    const enabledPairs = pairState.getEnabledPairs();

    const poolInfo = marketState.getPairsByAge();

    const poolsToCheck: string[] = [];
    for (const p of poolInfo.slice(0, degraded ? 3 : 10)) {
      const pair = pairState.getPair(p.label);
      if (pair) poolsToCheck.push(...pair.poolAddresses);
    }

    if (this.consecutiveIdleScans >= this.IDLE_THRESHOLD) {
      logWarning(`EventScheduler: ${this.consecutiveIdleScans} scans idle — revisando si market data está disponible`);
    }

    logDebug(`EventScheduler: ${enabledPairs.length} pares activos, ${poolsToCheck.length} pools, ${degraded ? "DEGRADADO" : "normal"}`);

    return {
      poolsToCheck,
      enabledPairs: enabledPairs.map((p) => ({ label: p.label, priority: p.priority })),
      useJupiterFallback: degraded || marketState.getPoolCount() < 3,
      degradedMode: degraded,
    };
  }

  debounceEvent(key: string, handler: () => void): void {
    const existing = this.debounceTimers.get(key);
    if (existing) clearTimeout(existing);
    this.debounceTimers.set(key, setTimeout(() => {
      this.debounceTimers.delete(key);
      try { handler(); } catch {}
    }, this.DEBOUNCE_MS));
  }

  clear(): void {
    this.disableWatchdog();
    for (const timer of this.debounceTimers.values()) clearTimeout(timer);
    this.debounceTimers.clear();
  }
}

export const eventScheduler = new EventScheduler();
