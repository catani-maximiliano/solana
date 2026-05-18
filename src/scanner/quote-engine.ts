import axios, { AxiosError } from "axios";
import { logWarning, logDebug, logInfo } from "../logger";
import { rateLimiter } from "../rate-limiter";

export interface QuoteRequest {
  inputMint: string;
  outputMint: string;
  amountLamports: number;
  slippageBps: number;
  onlyDirectRoutes?: boolean;
}

export interface DexSwapDetail {
  dexName: string;
  ammKey: string;
  inAmount: number;
  outAmount: number;
  feeAmount: number;
  percent: number;
}

export interface QuoteResult {
  inputMint: string;
  outputMint: string;
  amountIn: number;
  amountOut: number;
  priceImpactPct: number;
  routePlan: DexSwapDetail[];
  dexesUsed: string[];
  latencyMs: number;
  timestamp: number;
  contextSlot: number;
  source: "jupiter";
}

export interface BatchQuoteResult {
  results: Map<string, QuoteResult | null>;
  errors: string[];
  totalTimeMs: number;
}

const PRIMARY_URL = "https://lite-api.jup.ag";
const FALLBACK_URL = "https://api.jup.ag";
const API_PATH = "/swap/v1/quote";
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_RETRIES = 2;
const MAX_CONCURRENT_QUOTES = 4;

export class QuoteEngine {
  private primaryAvailable = true;
  private fallbackAvailable = true;
  private consecutiveErrors = 0;
  private lastEndpointSwitch = 0;
  private readonly ENDPOINT_COOLDOWN = 60_000;

  private getBaseUrl(): string {
    if (!this.primaryAvailable) return FALLBACK_URL;
    return PRIMARY_URL;
  }

  private switchEndpoint(): void {
    const now = Date.now();
    if (now - this.lastEndpointSwitch < this.ENDPOINT_COOLDOWN) return;
    this.lastEndpointSwitch = now;
    if (this.primaryAvailable) {
      this.primaryAvailable = false;
      logWarning("QuoteEngine: switching to fallback endpoint");
    } else {
      this.primaryAvailable = true;
      this.fallbackAvailable = true;
      logInfo("QuoteEngine: restored primary endpoint");
    }
  }

  async getQuote(request: QuoteRequest): Promise<QuoteResult | null> {
    const cacheKey = `quote:${request.inputMint}:${request.outputMint}:${request.amountLamports}:${request.slippageBps}:${request.onlyDirectRoutes}`;

    try {
      return await rateLimiter.execute(cacheKey, async () => {
        return await this.fetchQuote(request);
      });
    } catch {
      return null;
    }
  }

  private async fetchQuote(request: QuoteRequest): Promise<QuoteResult | null> {
    const baseUrl = this.getBaseUrl();
    const url = `${baseUrl}${API_PATH}`;
    const params = {
      inputMint: request.inputMint,
      outputMint: request.outputMint,
      amount: request.amountLamports,
      slippageBps: request.slippageBps,
      onlyDirectRoutes: request.onlyDirectRoutes ?? false,
    };

    let lastErr: string | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const startTime = Date.now();
        const response = await axios.get(url, {
          headers: { "User-Agent": "solana-arb-bot/1.0", Accept: "application/json" },
          timeout: REQUEST_TIMEOUT_MS,
          params,
        });
        const latencyMs = Date.now() - startTime;

        if (!response.data || typeof response.data !== "object") {
          lastErr = "invalid response";
          continue;
        }

        const d = response.data as Record<string, unknown>;
        if (typeof d.outAmount !== "string" || !d.outAmount) {
          lastErr = "no outAmount";
          continue;
        }
        if (!Array.isArray(d.routePlan)) {
          lastErr = "no routePlan";
          continue;
        }

        this.consecutiveErrors = 0;
        this.primaryAvailable = true;

        const routePlan = (d.routePlan as Array<Record<string, unknown>>).map((r) => {
          const si = (r.swapInfo as Record<string, unknown>) || {};
          return {
            dexName: (si.label as string) || (si.ammKey as string || "unknown").substring(0, 8),
            ammKey: (si.ammKey as string) || "",
            inAmount: parseInt(si.inAmount as string) || 0,
            outAmount: parseInt(si.outAmount as string) || 0,
            feeAmount: parseInt(si.feeAmount as string) || 0,
            percent: (r.percent as number) || 0,
          };
        });

        const dexesUsed = [...new Set(routePlan.map((r) => r.dexName))];

        return {
          inputMint: request.inputMint,
          outputMint: request.outputMint,
          amountIn: parseInt(d.inAmount as string) || 0,
          amountOut: parseInt(d.outAmount as string) || 0,
          priceImpactPct: parseFloat(d.priceImpactPct as string) || 0,
          routePlan,
          dexesUsed,
          latencyMs,
          timestamp: Date.now(),
          contextSlot: (d.contextSlot as number) || 0,
          source: "jupiter",
        };
      } catch (err) {
        const info = this.classifyError(err);
        lastErr = info.message;
        if (info.type === "RATE_LIMIT") {
          this.consecutiveErrors++;
          rateLimiter.handleRateLimit();
          return null;
        }
        if (info.type === "SERVER" || info.type === "TIMEOUT") {
          if (attempt < MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, 1000 * attempt));
            continue;
          }
        }
        if (info.type === "DNS" || info.type === "NETWORK") {
          this.switchEndpoint();
          if (attempt < MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, 500));
            continue;
          }
        }
        if (!info.retryable) break;
      }
    }

    this.consecutiveErrors++;
    if (this.consecutiveErrors > 10) {
      this.primaryAvailable = false;
    }
    return null;
  }

  async getBatchQuotes(requests: QuoteRequest[]): Promise<BatchQuoteResult> {
    const startTime = Date.now();
    const results = new Map<string, QuoteResult | null>();
    const errors: string[] = [];

    const chunks: QuoteRequest[][] = [];
    for (let i = 0; i < requests.length; i += MAX_CONCURRENT_QUOTES) {
      chunks.push(requests.slice(i, i + MAX_CONCURRENT_QUOTES));
    }

    for (const chunk of chunks) {
      const promises = chunk.map(async (req) => {
        const key = `${req.inputMint}:${req.outputMint}`;
        try {
          const result = await this.getQuote(req);
          results.set(key, result);
        } catch (err) {
          errors.push(`${key}: ${err instanceof Error ? err.message : String(err)}`);
          results.set(key, null);
        }
      });
      await Promise.all(promises);
    }

    return {
      results,
      errors,
      totalTimeMs: Date.now() - startTime,
    };
  }

  getRouteQuotes(solMint: string, tokenMint: string, usdcMint: string, amountLamports: number, slippageBps: number): Promise<BatchQuoteResult> {
    return this.getBatchQuotes([
      { inputMint: solMint, outputMint: tokenMint, amountLamports, slippageBps, onlyDirectRoutes: false },
      { inputMint: tokenMint, outputMint: usdcMint, amountLamports: 0, slippageBps, onlyDirectRoutes: false },
    ]);
  }

  private classifyError(err: unknown): { type: string; message: string; retryable: boolean } {
    if (axios.isAxiosError(err)) {
      const axErr = err as AxiosError;
      if (axErr.code === "ENOTFOUND" || axErr.code === "ECONNREFUSED") {
        return { type: "DNS", message: `DNS: ${axErr.code}`, retryable: true };
      }
      if (axErr.code === "ECONNABORTED" || (axErr.message && axErr.message.includes("timeout"))) {
        return { type: "TIMEOUT", message: "Timeout", retryable: true };
      }
      if (axErr.response?.status === 429) {
        return { type: "RATE_LIMIT", message: "429 rate limit", retryable: false };
      }
      if (axErr.response && axErr.response.status >= 500) {
        return { type: "SERVER", message: `${axErr.response.status} error`, retryable: true };
      }
      return { type: "NETWORK", message: axErr.message, retryable: true };
    }
    return { type: "UNKNOWN", message: String(err), retryable: false };
  }

  isAvailable(): boolean {
    return this.primaryAvailable || this.fallbackAvailable;
  }

  reset(): void {
    this.primaryAvailable = true;
    this.fallbackAvailable = true;
    this.consecutiveErrors = 0;
  }
}

export const quoteEngine = new QuoteEngine();
