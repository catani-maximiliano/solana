import { logWarning, logInfo, logDebug } from "./logger";
import { circuitBreaker } from "./circuit-breaker";

const CACHE_TTL_MS = 2_000;
const MAX_TOKENS = 6;
const REFILL_RATE = 1_000;
const MAX_CONCURRENT = 6;
const COOLDOWN_LEVELS = [0, 15_000, 30_000, 60_000, 120_000];
const JITTER_FACTOR = 0.25;
const METRIC_WINDOW_MS = 60_000;

export interface RateLimiterMetrics {
  requestsTotal: number;
  requestsSuccess: number;
  requestsFailed: number;
  rateLimitsHit: number;
  avgLatencyMs: number;
  cacheHits: number;
  cacheSize: number;
  queueDepth: number;
  activeCount: number;
  tokensAvailable: number;
  cooldownLevel: number;
  cooldownRemainingMs: number;
  refillRate: number;
}

interface CacheEntry<T> {
  value: T;
  expiry: number;
}

interface QueueItem {
  execute: () => Promise<void>;
  insertedAt: number;
}

export class RateLimiter {
  private tokens: number;
  private maxTokens: number;
  private refillInterval: number;
  private lastRefill: number;
  private maxConcurrent: number;
  private active = 0;

  private cooldownLevel = 0;
  private cooldownUntil = 0;
  private cooldownTimers: ReturnType<typeof setTimeout>[] = [];
  private cooldownRecoveryTimer: ReturnType<typeof setTimeout> | null = null;

  private queue: QueueItem[] = [];
  private cache = new Map<string, CacheEntry<unknown>>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  private requestsTotal = 0;
  private requestsSuccess = 0;
  private requestsFailed = 0;
  private rateLimitsTotal = 0;
  private latencies: number[] = [];
  private cacheHits = 0;
  private windowStart = Date.now();
  private budgetUsage = 0;

  constructor(requestsPerMinute: number = 60) {
    this.maxTokens = MAX_TOKENS;
    this.refillInterval = Math.max(500, 60_000 / requestsPerMinute);
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
    this.maxConcurrent = MAX_CONCURRENT;

    this.cleanupTimer = setInterval(() => this.cleanCache(), CACHE_TTL_MS);
    logDebug(`RateLimiter: token bucket iniciado | tokens=${this.maxTokens} refill=${this.refillInterval}ms concurrencia=${this.maxConcurrent}`);
  }

  destroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    for (const t of this.cooldownTimers) clearTimeout(t);
    if (this.cooldownRecoveryTimer) clearTimeout(this.cooldownRecoveryTimer);
  }

  private refillTokens(): void {
    const now = Date.now();
    if (now - this.lastRefill < 50) return;
    const elapsed = now - this.lastRefill;
    const tokensToAdd = Math.floor(elapsed / this.refillInterval);
    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  private drainTokens(count: number = 1): boolean {
    this.refillTokens();
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    return false;
  }

  private jitter(baseMs: number): number {
    const offset = baseMs * JITTER_FACTOR;
    return Math.max(1, Math.floor(baseMs + (Math.random() * offset * 2 - offset)));
  }

  private get isCooldownActive(): boolean {
    return this.cooldownUntil > Date.now();
  }

  get cooldownRemaining(): number {
    return Math.max(0, this.cooldownUntil - Date.now());
  }

  private getCooldownDuration(): number {
    const idx = Math.min(this.cooldownLevel, COOLDOWN_LEVELS.length - 1);
    return this.jitter(COOLDOWN_LEVELS[idx]);
  }

  private advanceCooldown(): void {
    for (const t of this.cooldownTimers) clearTimeout(t);
    this.cooldownTimers = [];
    if (this.cooldownRecoveryTimer) { clearTimeout(this.cooldownRecoveryTimer); this.cooldownRecoveryTimer = null; }

    this.cooldownLevel = Math.min(this.cooldownLevel + 1, COOLDOWN_LEVELS.length - 1);
    const duration = this.getCooldownDuration();
    this.cooldownUntil = Date.now() + duration;

    this.tokens = 0;

    logWarning(`RateLimiter: rate limit #${this.cooldownLevel} — cooldown ${Math.round(duration / 1000)}s (hasta las ${new Date(this.cooldownUntil).toISOString().substring(11, 19)})`);
    circuitBreaker.recordEvent("rateLimit");

    const timer = setTimeout(() => {
      logInfo(`RateLimiter: cooldown nivel ${this.cooldownLevel} finalizado — reanudación gradual`);
      this.cooldownUntil = 0;
      this.cooldownLevel = Math.max(0, this.cooldownLevel - 1);
      this.tokens = Math.min(this.maxTokens, Math.ceil(this.maxTokens / 3));
      this.lastRefill = Date.now();
      this.processQueueGradual();
    }, duration);
    this.cooldownTimers.push(timer);
  }

  private processQueueGradual(): void {
    const batch = this.queue.splice(0, Math.min(this.queue.length, Math.ceil(this.maxTokens / 2)));
    if (batch.length === 0) return;
    logDebug(`RateLimiter: reanudando ${batch.length}/${this.queue.length + batch.length} requests gradualmente`);
    for (const item of batch) {
      const delay = this.jitter(this.refillInterval);
      setTimeout(() => this.runQueuedItem(item), delay);
    }
  }

  private runQueuedItem(item: QueueItem): void {
    if (this.isCooldownActive) {
      this.queue.push(item);
      return;
    }
    this.active++;
    item.execute().finally(() => {
      this.active = Math.max(0, this.active - 1);
      this.drainFromQueue();
    });
  }

  private drainFromQueue(): void {
    if (this.isCooldownActive || this.queue.length === 0) return;
    while (this.queue.length > 0 && this.active < this.maxConcurrent && this.tokens > 0) {
      const item = this.queue.shift()!;
      this.active++;
      item.execute().finally(() => {
        this.active = Math.max(0, this.active - 1);
        this.drainFromQueue();
      });
    }
  }

  private cleanCache(): void {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.cache) {
      if (entry.expiry <= now) { this.cache.delete(key); removed++; }
    }
    if (removed > 0) logDebug(`RateLimiter: cache limpiado (${removed} expiradas, ${this.cache.size} activas)`);
  }

  private recordRequest(success: boolean, latencyMs: number): void {
    this.requestsTotal++;
    if (success) this.requestsSuccess++;
    else this.requestsFailed++;
    this.latencies.push(latencyMs);
    if (this.latencies.length > 500) this.latencies = this.latencies.slice(-500);
    this.budgetUsage++;
    this.resetWindowIfExpired();
  }

  recordRateLimit(): void { this.rateLimitsTotal++; }

  private resetWindowIfExpired(): void {
    if (Date.now() - this.windowStart > METRIC_WINDOW_MS) {
      this.windowStart = Date.now();
      this.requestsTotal = 0;
      this.requestsSuccess = 0;
      this.requestsFailed = 0;
      this.rateLimitsTotal = 0;
      this.cacheHits = 0;
      this.budgetUsage = 0;
    }
  }

  async execute<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const cached = this.cache.get(key);
    if (cached && cached.expiry > Date.now()) {
      this.cacheHits++;
      return cached.value as T;
    }

    if (this.isCooldownActive) {
      return new Promise<T>((resolve, reject) => {
        const item: QueueItem = {
          execute: async () => {
            try {
              const result = await fn();
              resolve(result);
            } catch (e) { reject(e); }
          },
          insertedAt: Date.now(),
        };
        this.queue.push(item);
      });
    }

    this.refillTokens();
    if (this.tokens <= 0) {
      return new Promise<T>((resolve, reject) => {
        const item: QueueItem = {
          execute: async () => {
            try {
              const result = await fn();
              resolve(result);
            } catch (e) { reject(e); }
          },
          insertedAt: Date.now(),
        };
        this.queue.push(item);
      });
    }

    return this.executeWithToken(key, fn);
  }

  private async executeWithToken<T>(key: string, fn: () => Promise<T>): Promise<T> {
    this.tokens = Math.max(0, this.tokens - 1);
    this.active++;
    const startTime = Date.now();

    try {
      const result = await fn();
      const latency = Date.now() - startTime;
      this.recordRequest(true, latency);
      this.cache.set(key, { value: result, expiry: Date.now() + CACHE_TTL_MS });
      return result;
    } catch (err) {
      const latency = Date.now() - startTime;
      this.recordRequest(false, latency);
      throw err;
    } finally {
      this.active = Math.max(0, this.active - 1);
      setTimeout(() => this.drainFromQueue(), 50);
    }
  }

  handleRateLimit(): void {
    this.rateLimitsTotal++;
    this.advanceCooldown();
  }

  getMetrics(): RateLimiterMetrics {
    this.resetWindowIfExpired();
    this.refillTokens();
    return {
      requestsTotal: this.requestsTotal,
      requestsSuccess: this.requestsSuccess,
      requestsFailed: this.requestsFailed,
      rateLimitsHit: this.rateLimitsTotal,
      avgLatencyMs: this.latencies.length > 0 ? this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length : 0,
      cacheHits: this.cacheHits,
      cacheSize: this.cache.size,
      queueDepth: this.queue.length,
      activeCount: this.active,
      tokensAvailable: this.tokens,
      cooldownLevel: this.cooldownLevel,
      cooldownRemainingMs: this.cooldownRemaining,
      refillRate: this.refillInterval,
    };
  }

  getBudgetUsage(): number { return this.budgetUsage; }

  resetWindow(): void {
    this.windowStart = Date.now();
    this.requestsTotal = 0;
    this.requestsSuccess = 0;
    this.requestsFailed = 0;
    this.rateLimitsTotal = 0;
    this.cacheHits = 0;
    this.budgetUsage = 0;
    this.latencies = [];
  }

  flushCache(): void { this.cache.clear(); }

  setRequestsPerMinute(rpm: number): void {
    this.refillInterval = Math.max(500, 60_000 / rpm);
    logDebug(`RateLimiter: refill rate ajustado a ${rpm} req/min (${this.refillInterval}ms/token)`);
  }
}

export const rateLimiter = new RateLimiter(60);
