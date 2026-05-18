import { Connection, PublicKey, SlotUpdate } from "@solana/web3.js";
import { logInfo, logWarning, logDebug, logError } from "../logger";
import { eventBus } from "../events";
import { circuitBreaker } from "../circuit-breaker";

export interface WsMetrics {
  connected: boolean;
  lastSlot: number;
  slotLag: number;
  avgLatencyMs: number;
  reconnectCount: number;
  subscriptionsCount: number;
  updatesPerSec: number;
  accountUpdatesPerSec: number;
  droppedSubscriptions: number;
}

interface WsSubscription {
  type: "account" | "slot" | "program";
  address: string;
  callback: any;
  unsubscribe?: () => void;
  lastUpdate: number;
  updateCount: number;
  firstUpdateTime: number;
}

export class WebSocketManager {
  private connection: Connection;
  private subscriptions: Map<string, WsSubscription> = new Map();
  private lastSlot = 0;
  private lastSlotTime = 0;
  private reconnectCount = 0;
  private isConnected = false;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private slots: number[] = [];
  private updateTimestamps: number[] = [];
  private accountUpdateTimestamps: number[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private droppedSubscriptions = 0;
  private slotSubId: number | null = null;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  async start(): Promise<boolean> {
    logInfo("WebSocket Manager: iniciando...");

    try {
      const slot = await this.connection.getSlot();
      this.lastSlot = slot;
      this.lastSlotTime = Date.now();
      this.isConnected = true;

      this.slotSubId = this.connection.onSlotUpdate((slotUpdate: SlotUpdate) => {
        if (this.destroyed) return;
        const now = Date.now();
        this.lastSlot = slotUpdate.slot;
        this.lastSlotTime = now;
        this.slots.push(now);
        if (this.slots.length > 100) this.slots.shift();
        this.updateTimestamps.push(now);
        if (this.updateTimestamps.length > 200) this.updateTimestamps.shift();

        eventBus.emit({
          type: "slot:update",
          timestamp: now,
          data: { slot: slotUpdate.slot, type: slotUpdate.type },
        });
      });

      this.healthCheckTimer = setInterval(() => this.healthCheck(), 15000);

      logInfo(`WebSocket Manager: conectado (slot ${slot})`);
      eventBus.emit({
        type: "ws:connected",
        timestamp: Date.now(),
        data: { slot },
      });

      return true;
    } catch (err) {
      logError("WebSocket Manager: falló conexión inicial", err);
      this.isConnected = false;
      this.scheduleReconnect();
      return false;
    }
  }

  subscribeAccount(
    address: string,
    callback: (data: Buffer | null, slot: number) => void,
    commitment: "confirmed" | "finalized" = "confirmed"
  ): string {
    if (!address || address.length < 32) {
      logWarning(`WS: dirección inválida ignorada — "${address?.substring(0, 12)}..."`);
      return "";
    }

    const key = `account:${address}`;
    if (this.subscriptions.has(key)) {
      logDebug(`WS: subscription ya activa para ${address.substring(0, 8)}...`);
      return key;
    }

    try {
      const pubkey = new PublicKey(address);
      const unsub = this.connection.onAccountChange(
        pubkey,
        (accountInfo, ctx) => {
          if (this.destroyed) return;
          const now = Date.now();
          callback(accountInfo.data, ctx.slot);
          const sub = this.subscriptions.get(key);
          if (sub) {
            sub.lastUpdate = now;
            sub.updateCount++;
          }
          this.updateTimestamps.push(now);
          this.accountUpdateTimestamps.push(now);
          if (this.updateTimestamps.length > 200) this.updateTimestamps.shift();
          if (this.accountUpdateTimestamps.length > 200) this.accountUpdateTimestamps.shift();
        },
        commitment
      );

      const sub: WsSubscription = {
        type: "account",
        address,
        callback,
        lastUpdate: Date.now(),
        updateCount: 0,
        firstUpdateTime: Date.now(),
      };

      this.subscriptions.set(key, sub);
      logInfo(`WS: ✅ subscripto a cuenta ${address.substring(0, 8)}...`);
    } catch (err) {
      logError(`WS: error subscriptiendo a ${address.substring(0, 8)}...`, err);
    }

    return key;
  }

  getSubscriptionAge(key: string): number {
    const sub = this.subscriptions.get(key);
    if (!sub) return 0;
    return Date.now() - sub.firstUpdateTime;
  }

  getSubscriptionUpdateCount(key: string): number {
    const sub = this.subscriptions.get(key);
    return sub?.updateCount || 0;
  }

  getLastUpdateTime(key: string): number {
    const sub = this.subscriptions.get(key);
    return sub?.lastUpdate || 0;
  }

  getConnectedSubscriptions(): number {
    let count = 0;
    for (const sub of this.subscriptions.values()) {
      if (Date.now() - sub.lastUpdate < 120_000) count++;
    }
    return count;
  }

  getSubscriptionsWithDetails(): Array<{ address: string; lastUpdate: number; updateCount: number; age: number }> {
    const details: Array<{ address: string; lastUpdate: number; updateCount: number; age: number }> = [];
    for (const [key, sub] of this.subscriptions) {
      details.push({
        address: key.replace("account:", ""),
        lastUpdate: sub.lastUpdate,
        updateCount: sub.updateCount,
        age: Date.now() - sub.firstUpdateTime,
      });
    }
    return details;
  }

  unsubscribe(key: string): void {
    const sub = this.subscriptions.get(key);
    if (sub) {
      if (sub.unsubscribe) sub.unsubscribe();
      this.subscriptions.delete(key);
      this.droppedSubscriptions++;
    }
  }

  unsubscribeAccount(address: string): void {
    this.unsubscribe(`account:${address}`);
  }

  getSubscriptionsCount(): number {
    return this.subscriptions.size;
  }

  getCurrentSlot(): number {
    return this.lastSlot;
  }

  getSlotLag(): number {
    if (!this.lastSlotTime) return 0;
    return Date.now() - this.lastSlotTime;
  }

  getMetrics(): WsMetrics {
    const now = Date.now();
    const recentUpdates = this.updateTimestamps.filter((t) => now - t < 10000);
    const updatesPerSec = recentUpdates.length / 10;
    const recentAccountUpdates = this.accountUpdateTimestamps.filter((t) => now - t < 10000);
    const accountUpdatesPerSec = recentAccountUpdates.length / 10;

    return {
      connected: this.isConnected,
      lastSlot: this.lastSlot,
      slotLag: this.getSlotLag(),
      avgLatencyMs: this.getAvgSlotLatency(),
      reconnectCount: this.reconnectCount,
      subscriptionsCount: this.subscriptions.size,
      updatesPerSec,
      accountUpdatesPerSec,
      droppedSubscriptions: this.droppedSubscriptions,
    };
  }

  private getAvgSlotLatency(): number {
    if (this.slots.length < 2) return 0;
    const intervals: number[] = [];
    for (let i = 1; i < this.slots.length; i++) {
      intervals.push(this.slots[i] - this.slots[i - 1]);
    }
    return intervals.length > 0
      ? intervals.reduce((a, b) => a + b, 0) / intervals.length
      : 0;
  }

  private healthCheck(): void {
    const lag = this.getSlotLag();
    if (lag > 30000 && this.isConnected) {
      logWarning(`WS: slot lag ${lag}ms — posible desconexión`);
      this.isConnected = false;
      eventBus.emit({
        type: "ws:disconnected",
        timestamp: Date.now(),
        data: { reason: "timeout", lag },
      });
      circuitBreaker.recordEvent("failure");
      this.scheduleReconnect();
    }

    if (this.isConnected) {
      const updates = this.getMetrics();
      if (updates.subscriptionsCount > 0 && updates.accountUpdatesPerSec === 0 && Date.now() - this.lastSlotTime > 30000) {
        const staleSubs = this.getSubscriptionsWithDetails().filter((s) => Date.now() - s.lastUpdate > 60000);
        if (staleSubs.length === this.subscriptions.size) {
          logWarning(`WS: todas las subscriptions sin updates >60s — verificando conexión`);
        }
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    const delay = Math.min(30000, 1000 * Math.pow(2, this.reconnectCount));
    logInfo(`WS: reconexión en ${delay / 1000}s (intento #${this.reconnectCount + 1})`);

    this.reconnectTimer = setTimeout(async () => {
      if (this.destroyed) return;
      this.reconnectCount++;
      const ok = await this.start();
      if (ok) {
        logInfo(`WS: reconectado tras ${this.reconnectCount} intentos`);
        eventBus.emit({
          type: "ws:reconnect",
          timestamp: Date.now(),
          data: { attempts: this.reconnectCount },
        });
        this.resubscribeAll();
      }
    }, delay);
  }

  private resubscribeAll(): void {
    const currentSubs = new Map(this.subscriptions);
    this.subscriptions.clear();
    let restored = 0;
    for (const [, sub] of currentSubs) {
      if (sub.type === "account") {
        this.subscribeAccount(sub.address, sub.callback);
        restored++;
      }
    }
    logInfo(`WS: ${restored} subscriptions restauradas de ${currentSubs.size}`);
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    try {
      if (this.slotSubId !== null) {
        await this.connection.removeSlotUpdateListener(this.slotSubId);
      }
    } catch {}
    for (const [, sub] of this.subscriptions) {
      if (sub.unsubscribe) sub.unsubscribe();
    }
    this.subscriptions.clear();
    this.isConnected = false;
  }
}
