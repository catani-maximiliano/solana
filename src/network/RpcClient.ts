import { Connection } from "@solana/web3.js";
import { logInfo, logWarning, logDebug } from "../logger";

const RPC_URL = process.env.SOLANA_RPC_URL || process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
const WS_URL = process.env.SOLANA_WS_URL || process.env.WS_URL || "";
const API_KEY = process.env.SOLANA_API_KEY || process.env.API_KEY || "";

let customConnection: Connection | null = null;
let rpcMetrics = { latency: 0, lastSlot: 0, reconnectCount: 0, startTime: Date.now() };

/** Create a custom fetch with x-api-key header for NoLimitNodes */
function createRpcFetch(): typeof fetch {
  return async (input: any, init?: RequestInit): Promise<Response> => {
    const start = performance.now();
    const headers = new Headers(init?.headers || {});
    headers.set("Content-Type", "application/json");
    if (API_KEY) headers.set("x-api-key", API_KEY);

    try {
      const response = await fetch(input, { ...init, headers });
      rpcMetrics.latency = Math.round(performance.now() - start);
      return response;
    } catch (err) {
      logWarning(`RPC: fetch error — ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  };
}

/** Get or create the custom RPC connection */
export function getRpcConnection(): Connection {
  if (customConnection) return customConnection;

  const wsEndpoint = WS_URL || RPC_URL.replace("https://", "wss://").replace("http://", "ws://");

  logInfo(`RPC: ${RPC_URL.substring(0, 40)}...`);
  if (WS_URL) logInfo(`WS:  ${WS_URL}`);
  if (API_KEY) logInfo(`API key: ${API_KEY.substring(0, 8)}...`);

  customConnection = new Connection(RPC_URL, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 60000,
    wsEndpoint,
    fetch: createRpcFetch(),
  });

  return customConnection;
}

/** Get RPC health metrics */
export function getRpcMetrics() {
  return { ...rpcMetrics };
}

/** Record slot for health tracking */
export function recordRpcSlot(slot: number): void {
  rpcMetrics.lastSlot = slot;
}

/** Record a reconnect event */
export function recordRpcReconnect(): void {
  rpcMetrics.reconnectCount++;
}

/** Print RPC health dashboard */
export function printRpcHealth(): void {
  const uptime = Math.round((Date.now() - rpcMetrics.startTime) / 1000);
  logInfo(`━━━━━━━━ RPC HEALTH ──────────`);
  logInfo(`Provider: ${API_KEY ? "NoLimitNodes" : "Public RPC"}`);
  logInfo(`RPC latency: ${rpcMetrics.latency}ms`);
  logInfo(`Latest slot: ${rpcMetrics.lastSlot}`);
  logInfo(`Reconnects: ${rpcMetrics.reconnectCount}`);
  logInfo(`Uptime: ${uptime}s`);
  logInfo(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

/** Reset connection (for testing / reconnection) */
export function resetRpcConnection(): void {
  customConnection = null;
}
