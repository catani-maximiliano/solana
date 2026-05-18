import axios from "axios";
import { logInfo, logSuccess, logWarning, logDebug } from "../logger";
import { marketState } from "../market";
import { TOKEN_MINTS } from "../config/pools";

export interface ScannerTokenInfo {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  liquidityUsd: number;
  dailyVolumeUsd: number;
  priceUsd: number;
}

export interface TokenPair {
  base: ScannerTokenInfo;
  quote: ScannerTokenInfo;
  label: string;
}

const JUPITER_TOKEN_LIST_URL = "https://token.jup.ag/strict";
const MIN_LIQUIDITY_USD = 500_000;
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const MAX_TOKENS = 60;

const HIGH_VALUE_MINTS: Record<string, string> = {
  "So11111111111111111111111111111111111111112": "SOL",
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": "USDC",
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": "USDT",
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN": "JUP",
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": "BONK",
  "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm": "WIF",
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": "RAY",
  "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE": "ORCA",
  "pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biYPD": "PYTH",
  "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL": "JTO",
  "METAewgxyPjwsTESkdUbnBshXrUMCLaYqFR2TewKxBg": "META",
  "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So": "mSOL",
  "7dHbWXmci3dT8UFYWYZweBL5Gq6tXFGoeMG85qNBYtC": "BST",
  "HjpQZQ3Lhp5WN32MFMks7boEADPPvA7sA5L6bQK2P3C": "POPCAT",
  "MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5": "MEW",
  "ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82": "BOME",
  "2weMjPLLybRMMva1fM3U31goWWrCpF59CHWNhnCJ9Vyh": "MYRO",
  "Df6yfrKC8kZE3KNkrHERKzAETcxhYJk3NqoyrNTwDx3e": "SAMO",
  "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr": "WEN",
};

export class TokenDiscovery {
  private tokens: Map<string, ScannerTokenInfo> = new Map();
  private pairs: TokenPair[] = [];
  private lastRefresh = 0;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private refreshInProgress = false;

  constructor() {
    this.seedKnownTokens();
  }

  private seedKnownTokens(): void {
    for (const [mint, symbol] of Object.entries(HIGH_VALUE_MINTS)) {
      if (!this.tokens.has(mint)) {
        this.tokens.set(mint, {
          mint,
          symbol,
          name: symbol,
          decimals: TOKEN_MINTS[mint] !== undefined ? 6 : 9,
          liquidityUsd: 1_000_000,
          dailyVolumeUsd: 5_000_000,
          priceUsd: symbol === "SOL" ? 160 : 1,
        });
      }
    }
    logDebug(`TokenDiscovery: ${this.tokens.size} tokens semilla cargados`);
  }

  getMintAddress(symbol: string): string | undefined {
    for (const [mint, info] of this.tokens) {
      if (info.symbol === symbol) return mint;
    }
    for (const [mint, sym] of Object.entries(HIGH_VALUE_MINTS)) {
      if (sym === symbol) return mint;
    }
    return undefined;
  }

  getSymbol(mint: string): string {
    return this.tokens.get(mint)?.symbol || mint.substring(0, 6);
  }

  async refresh(): Promise<void> {
    if (this.refreshInProgress) return;
    this.refreshInProgress = true;

    try {
      const response = await axios.get(JUPITER_TOKEN_LIST_URL, { timeout: 15_000 });
      const data = response.data as Record<string, unknown>;

      const entries: ScannerTokenInfo[] = [];

      if (Array.isArray(data)) {
        for (const item of data as Array<Record<string, unknown>>) {
          const mint = item.address as string || item.mint as string;
          if (!mint) continue;
          const liquidity = parseFloat(String(item.liquidity || item.usdLiquidity || "0"));
          const volume = parseFloat(String(item.dailyVolume || item.volume24h || "0"));
          const price = parseFloat(String(item.price || "0"));

          entries.push({
            mint,
            symbol: String(item.symbol || "?"),
            name: String(item.name || "?"),
            decimals: parseInt(String(item.decimals || "6")),
            liquidityUsd: liquidity,
            dailyVolumeUsd: volume,
            priceUsd: price,
          });
        }
      } else if (data && typeof data === "object") {
        for (const [mint, val] of Object.entries(data)) {
          const entry = val as Record<string, unknown>;
          const liquidity = parseFloat(String(entry.liquidity || entry.usdLiquidity || "0"));
          entries.push({
            mint,
            symbol: String(entry.symbol || mint.substring(0, 6)),
            name: String(entry.name || entry.symbol || "?"),
            decimals: parseInt(String(entry.decimals || "6")),
            liquidityUsd: liquidity,
            dailyVolumeUsd: parseFloat(String(entry.dailyVolume || entry.volume24h || "0")),
            priceUsd: parseFloat(String(entry.price || "0")),
          });
        }
      }

      const filtered = entries
        .filter((t) => t.liquidityUsd >= MIN_LIQUIDITY_USD)
        .sort((a, b) => b.liquidityUsd - a.liquidityUsd)
        .slice(0, MAX_TOKENS);

      for (const t of filtered) {
        this.tokens.set(t.mint, t);
      }

      this.lastRefresh = Date.now();
      this.buildPairs();
      logSuccess(`TokenDiscovery: ${this.tokens.size} tokens, ${this.pairs.length} pares generados automáticamente`);
    } catch (err) {
      logWarning(`TokenDiscovery: error fetching token list — usando tokens semilla: ${err instanceof Error ? err.message : String(err)}`);
      this.buildPairs();
    } finally {
      this.refreshInProgress = false;
    }
  }

  getQuoteTokens(): ScannerTokenInfo[] {
    return Array.from(this.tokens.values())
      .filter((t) => t.symbol === "USDC" || t.symbol === "USDT" || t.symbol === "SOL")
      .sort((a, b) => b.liquidityUsd - a.liquidityUsd);
  }

  private buildPairs(): void {
    const all = Array.from(this.tokens.values());
    const quoteTokens = this.getQuoteTokens();
    const baseTokens = all.filter((t) => !quoteTokens.find((q) => q.mint === t.mint));

    const generated: TokenPair[] = [];
    const seen = new Set<string>();

    for (const base of baseTokens) {
      for (const quote of quoteTokens) {
        const label = `${base.symbol}/${quote.symbol}`;
        if (seen.has(label)) continue;
        seen.add(label);
        generated.push({ base, quote, label });
      }
    }

    this.pairs = generated.sort((a, b) => {
      const aScore = a.base.liquidityUsd + a.quote.liquidityUsd;
      const bScore = b.base.liquidityUsd + b.quote.liquidityUsd;
      return bScore - aScore;
    });

    logInfo(`TokenDiscovery: ${this.pairs.length} pares generados (top: ${this.pairs.slice(0, 5).map((p) => p.label).join(", ")})`);
  }

  start(intervalMs: number = REFRESH_INTERVAL_MS): void {
    this.refresh();
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = setInterval(() => this.refresh(), intervalMs);
    logInfo(`TokenDiscovery: auto-refresh cada ${intervalMs / 1000}s`);
  }

  stop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  getAllPairs(): TokenPair[] {
    return this.pairs;
  }

  getTopPairs(count: number = 50): TokenPair[] {
    return this.pairs.slice(0, count);
  }

  getToken(mint: string): ScannerTokenInfo | undefined {
    return this.tokens.get(mint);
  }

  getTokenCount(): number {
    return this.tokens.size;
  }

  getPairCount(): number {
    return this.pairs.length;
  }
}

export const tokenDiscovery = new TokenDiscovery();
