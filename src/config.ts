import { Connection, Keypair } from "@solana/web3.js";
import dotenv from "dotenv";
import bs58 from "bs58";
import { MarketDataProvider, jupiterProvider, WhirlpoolProvider, RaydiumClmmProvider, MeteoraDlmmProvider, DexPoolReader } from "./market";

dotenv.config();

export interface BotConfig {
  privateKey: string;
  rpcUrl: string;
  minProfitUsd: number;
  maxTradeSol: number;
  slippageBps: number;
  checkIntervalMs: number;
  dryRun: boolean;
  debugMode: boolean;
  quoteSizesSol: number[];
  maxQuoteAgeMs: number;
  maxRequestsPerMin: number;
  persistenceRequired: number;
  scanMaxPairs: number;
  scanMinLiquidityUsd: number;
  scanProfitMultiplier: number;
  scanEnableTriangular: boolean;
  scanQuoteSizeSol: number;
  scanMinGrossSpreadBps: number;
  connection: Connection;
  keypair: Keypair;
  walletPublicKey: string;
  marketProviders: MarketDataProvider[];
  directPoolProviders: DexPoolReader[];
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") throw new Error(`Variable requerida: ${name}`);
  return value.trim();
}

function requireNumber(name: string, defaultVal?: number): number {
  const raw = process.env[name];
  if (!raw && defaultVal !== undefined) return defaultVal;
  if (!raw) throw new Error(`Variable numérica requerida: ${name}`);
  const num = parseFloat(raw);
  if (isNaN(num)) throw new Error(`${name} debe ser número: "${raw}"`);
  return num;
}

function requireBool(name: string, defaultVal: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return defaultVal;
  return raw.toLowerCase() === "true";
}

function parseSizes(name: string, defaultSizes: number[]): number[] {
  const raw = process.env[name];
  if (!raw) return defaultSizes;
  return raw.split(",").map((s) => {
    const n = parseFloat(s.trim());
    if (isNaN(n)) throw new Error(`Valor inválido en ${name}: "${s.trim()}"`);
    return n;
  });
}

function loadKeypair(privateKeyBase58: string): Keypair {
  try {
    const decoded = bs58.decode(privateKeyBase58);
    return Keypair.fromSecretKey(decoded);
  } catch {
    throw new Error("PRIVATE_KEY inválida. Debe ser base58.");
  }
}

function loadConfig(): BotConfig {
  console.log("Cargando configuración...");

  const privateKey = requireEnv("PRIVATE_KEY");
  const rpcUrl = requireEnv("RPC_URL");

  const minProfitUsd = requireNumber("MIN_PROFIT_USD", 0.05);
  const maxTradeSol = requireNumber("MAX_TRADE_SOL", 0.1);
  const slippageBps = requireNumber("SLIPPAGE_BPS", 50);
  const checkIntervalMs = requireNumber("CHECK_INTERVAL_MS", 3000);
  const maxQuoteAgeMs = requireNumber("MAX_QUOTE_AGE_MS", 1500);
  const maxRequestsPerMin = requireNumber("MAX_REQUESTS_PER_MIN", 60);
  const persistenceRequired = requireNumber("PERSISTENCE_REQUIRED", 2);
  const scanMaxPairs = requireNumber("SCAN_MAX_PAIRS", 50);
  const scanMinLiquidityUsd = requireNumber("SCAN_MIN_LIQUIDITY_USD", 500_000);
  const scanProfitMultiplier = requireNumber("SCAN_PROFIT_MULTIPLIER", 2);
  const scanQuoteSizeSol = requireNumber("SCAN_QUOTE_SIZE_SOL", 0.05);
  const scanMinGrossSpreadBps = requireNumber("SCAN_MIN_GROSS_SPREAD_BPS", 0);

  const dryRun = process.env.DRY_RUN !== "false";
  const debugMode = requireBool("DEBUG_MODE", false);
  const scanEnableTriangular = requireBool("SCAN_ENABLE_TRIANGULAR", true);
  const quoteSizesSol = parseSizes("QUOTE_SIZES", [0.05, 0.1]);

  const keypair = loadKeypair(privateKey);
  const walletPublicKey = keypair.publicKey.toBase58();

  const connection = new Connection(rpcUrl, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 60000,
    wsEndpoint: rpcUrl.replace("https://", "wss://").replace("http://", "ws://"),
  });

  const whirlpool = new WhirlpoolProvider(connection);
  const raydium = new RaydiumClmmProvider(connection);
  const meteora = new MeteoraDlmmProvider(connection);

  const config: BotConfig = {
    privateKey, rpcUrl,
    minProfitUsd, maxTradeSol, slippageBps, checkIntervalMs,
    dryRun, debugMode, quoteSizesSol,
    maxQuoteAgeMs, maxRequestsPerMin, persistenceRequired,
    scanMaxPairs, scanMinLiquidityUsd, scanProfitMultiplier, scanEnableTriangular, scanQuoteSizeSol, scanMinGrossSpreadBps,
    connection, keypair, walletPublicKey,
    marketProviders: [jupiterProvider],
    directPoolProviders: [whirlpool, raydium, meteora],
  };

  console.log("Configuración cargada:");
  console.log(`   RPC URL:             ${rpcUrl.substring(0, 40)}...`);
  console.log(`   Wallet:              ${walletPublicKey}`);
  console.log(`   Min Profit USD:      $${minProfitUsd}`);
  console.log(`   Max Trade SOL:       ${maxTradeSol} SOL`);
  console.log(`   Slippage:            ${slippageBps} bps`);
  console.log(`   Check Interval:      ${checkIntervalMs}ms`);
  console.log(`   Quote Sizes:         [${quoteSizesSol.join(", ")}] SOL`);
  console.log(`   Max Quote Age:       ${maxQuoteAgeMs}ms`);
  console.log(`   Max Requests/min:    ${maxRequestsPerMin}`);
  console.log(`   Persistence Req:     ${persistenceRequired} scans`);
  console.log(`   Scanner Max Pairs:   ${scanMaxPairs}`);
  console.log(`   Scanner Min Liq:     $${scanMinLiquidityUsd.toLocaleString()}`);
  console.log(`   Scanner Profit Mult: ${scanProfitMultiplier}x`);
  console.log(`   Scanner Triangular:  ${scanEnableTriangular ? "ON" : "OFF"}`);
  console.log(`   Scanner Quote Size:  ${scanQuoteSizeSol} SOL`);
  console.log(`   Scanner Min Gross:   ${scanMinGrossSpreadBps} bps (configurable, 0=dynamic)`);
  console.log(`   DEBUG MODE:          ${debugMode ? "ON" : "OFF"}`);
  console.log(`   Market Providers:    [${config.marketProviders.map((p) => p.name).join(", ")}]`);
  console.log(`   Direct Pool Readers: [${config.directPoolProviders.map((p) => p.dexName).join(", ")}]`);
  console.log(`   DRY RUN:             ${dryRun ? "ACTIVADO" : "DESACTIVADO"}`);

  if (!dryRun) {
    console.error("\nADVERTENCIA: DRY_RUN ESTÁ DESACTIVADO\n");
  }

  return config;
}

export const config = loadConfig();
