import axios, { AxiosError } from "axios";
import { MarketDataProvider, PriceQuote, QuoteRequest, DexSwapDetail } from "./types";

const PRIMARY_URL = "https://lite-api.jup.ag";
const FALLBACK_URL = "https://api.jup.ag";
const API_PATH = "/swap/v1/quote";
const TIMEOUT_MS = 10_000;

const HEADERS: Record<string, string> = {
  "User-Agent": "solana-arb-bot/1.0",
  Accept: "application/json",
};

export class JupiterProvider implements MarketDataProvider {
  readonly name = "Jupiter";
  private available = true;
  private lastError: string | null = null;
  private errorCount = 0;

  isAvailable(): boolean {
    return this.available;
  }

  async getQuote(request: QuoteRequest): Promise<PriceQuote | null> {
    const params = {
      inputMint: request.inputMint,
      outputMint: request.outputMint,
      amount: request.amountLamports,
      slippageBps: request.slippageBps,
      onlyDirectRoutes: false,
    };

    const endpoints = [PRIMARY_URL, FALLBACK_URL];
    let lastErr: string | null = null;

    for (const baseUrl of endpoints) {
      const url = `${baseUrl}${API_PATH}`;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const startTime = Date.now();
          const response = await axios.get(url, { headers: HEADERS, timeout: TIMEOUT_MS, params });
          const latencyMs = Date.now() - startTime;

          if (!response.data || typeof response.data !== "object") {
            lastErr = "respuesta inválida";
            continue;
          }

          const d = response.data as Record<string, unknown>;
          if (typeof d.outAmount !== "string" || !d.outAmount) {
            lastErr = "sin outAmount";
            continue;
          }
          if (!Array.isArray(d.routePlan)) {
            lastErr = "sin routePlan";
            continue;
          }
          if (typeof d.priceImpactPct !== "string") {
            lastErr = "sin priceImpactPct";
            continue;
          }

          this.errorCount = 0;
          this.available = true;

          return {
            inputMint: request.inputMint,
            outputMint: request.outputMint,
            amountIn: parseInt(d.inAmount as string) || 0,
            amountOut: parseInt(d.outAmount),
            priceImpactPct: parseFloat(d.priceImpactPct),
            routePlan: extractDexSwaps(d.routePlan as Array<Record<string, unknown>>),
            dexesUsed: extractDexNames(d.routePlan as Array<Record<string, unknown>>),
            latencyMs,
            timestamp: Date.now(),
            contextSlot: (d.contextSlot as number) || 0,
            timeTaken: (d.timeTaken as number) || 0,
            source: "jupiter",
          };
        } catch (err) {
          const info = classifyError(err);
          lastErr = info.message;
          if (info.type === "RATE_LIMIT") {
            this.errorCount++;
            if (this.errorCount > 5) this.available = false;
            return null;
          }
          if (!info.retryable) break;
        }
      }
    }

    this.errorCount++;
    if (this.errorCount > 5) this.available = false;
    this.lastError = lastErr;
    return null;
  }
}

function extractDexSwaps(routePlan: Array<Record<string, unknown>>): DexSwapDetail[] {
  return routePlan.map((r) => {
    const swapInfo = r.swapInfo as Record<string, unknown> || {};
    const inAmt = parseInt(swapInfo.inAmount as string) || 0;
    const outAmt = parseInt(swapInfo.outAmount as string) || 0;
    return {
      dexName: (swapInfo.label as string) || (swapInfo.ammKey as string || "unknown").substring(0, 8),
      ammKey: swapInfo.ammKey as string || "",
      inAmount: inAmt,
      outAmount: outAmt,
      feeAmount: parseInt(swapInfo.feeAmount as string) || 0,
      percent: r.percent as number || 0,
      effectivePrice: inAmt > 0 ? outAmt / inAmt : 0,
    };
  });
}

function extractDexNames(routePlan: Array<Record<string, unknown>>): string[] {
  const names = routePlan.map((r) => {
    const si = r.swapInfo as Record<string, unknown> || {};
    return (si.label as string) || (si.ammKey as string || "unknown").substring(0, 8);
  });
  return [...new Set(names)];
}

interface ErrorInfo {
  type: "DNS" | "TIMEOUT" | "RATE_LIMIT" | "SERVER" | "NETWORK" | "UNKNOWN";
  message: string;
  retryable: boolean;
}

function classifyError(err: unknown): ErrorInfo {
  if (axios.isAxiosError(err)) {
    const axErr = err as AxiosError;
    if (axErr.code === "ENOTFOUND" || axErr.code === "ECONNREFUSED") {
      return { type: "DNS", message: `DNS error: ${axErr.code}`, retryable: true };
    }
    if (axErr.code === "ECONNABORTED" || (axErr.message && axErr.message.includes("timeout"))) {
      return { type: "TIMEOUT", message: "Timeout", retryable: true };
    }
    if (axErr.response?.status === 429) {
      return { type: "RATE_LIMIT", message: "429 rate limit", retryable: false };
    }
    if (axErr.response && axErr.response.status >= 500) {
      return { type: "SERVER", message: `${axErr.response.status} server error`, retryable: true };
    }
    return { type: "NETWORK", message: axErr.message, retryable: true };
  }
  return { type: "UNKNOWN", message: String(err), retryable: false };
}

export const jupiterProvider = new JupiterProvider();
