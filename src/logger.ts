import fs from "fs";
import path from "path";

const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  gray: "\x1b[90m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
};

const DATA_DIR = path.join(process.cwd(), "data");
const TRADES_FILE = path.join(DATA_DIR, "trades.json");
const LOGS_DIR = path.join(process.cwd(), "logs");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

export interface TradeLog {
  timestamp: string;
  mode: "DRY_RUN" | "LIVE";
  pair: string;
  inputMint: string;
  outputMint: string;
  amountIn: number;
  estimatedProfit: number;
  profitUsd: number;
  priceImpact: number;
  route: string[];
  dexOrigin: string;
  dexDestination: string;
  spreadPct: number;
  grossProfitUsd: number;
  estimatedFeesUsd: number;
  score: number;
  confidence: number;
  quoteAgeMs: number;
  slippageBps: number;
  executed: boolean;
  txSignature?: string;
  error?: string;
}

function timestamp(): string {
  return new Date().toISOString().replace("T", " ").substring(0, 23);
}

export function logInfo(message: string): void {
  console.log(`${COLORS.gray}[${timestamp()}]${COLORS.reset} ${COLORS.cyan}ℹ${COLORS.reset} ${message}`);
}

export function logSuccess(message: string): void {
  console.log(`${COLORS.gray}[${timestamp()}]${COLORS.reset} ${COLORS.green}✅${COLORS.reset} ${message}`);
}

export function logWarning(message: string): void {
  console.log(`${COLORS.gray}[${timestamp()}]${COLORS.reset} ${COLORS.yellow}⚠${COLORS.reset} ${message}`);
}

export function logError(message: string, error?: unknown): void {
  const errMsg = error instanceof Error ? error.message : String(error || "");
  console.error(`${COLORS.gray}[${timestamp()}]${COLORS.reset} ${COLORS.red}❌${COLORS.reset} ${message}${errMsg ? `: ${errMsg}` : ""}`);
}

export function logDebug(message: string, data?: Record<string, unknown>): void {
  const dataStr = data ? ` | ${JSON.stringify(data)}` : "";
  console.log(`${COLORS.gray}[${timestamp()}]${COLORS.reset} ${COLORS.blue}🔍${COLORS.reset} ${message}${dataStr}`);
}

export function logOpportunity(trade: TradeLog): void {
  const profitColor = trade.profitUsd > 0 ? COLORS.green : COLORS.red;
  const scoreColor = trade.score >= 7 ? COLORS.green : trade.score >= 4 ? COLORS.yellow : COLORS.red;

  console.log(`\n${COLORS.bright}${COLORS.magenta}╔══════════════════════════════════════════╗${COLORS.reset}`);
  console.log(`${COLORS.bright}${COLORS.magenta}║   🎯  OPORTUNIDAD DETECTADA              ║${COLORS.reset}`);
  console.log(`${COLORS.bright}${COLORS.magenta}╚══════════════════════════════════════════╝${COLORS.reset}`);
  console.log(`  Par:            ${COLORS.bright}${trade.pair}${COLORS.reset}`);
  console.log(`  DEX:            ${trade.dexOrigin} → ${trade.dexDestination}`);
  console.log(`  Spread:         ${profitColor}${trade.spreadPct.toFixed(4)}%${COLORS.reset}`);
  console.log(`  Profit USD:     ${profitColor}${COLORS.bright}$${trade.profitUsd.toFixed(4)}${COLORS.reset}`);
  console.log(`  Score:          ${scoreColor}${trade.score.toFixed(1)}/10${COLORS.reset}`);
  console.log(`  Confianza:      ${(trade.confidence * 100).toFixed(0)}%`);
  console.log(`  Quote age:      ${trade.quoteAgeMs}ms`);
  console.log(`  Price Impact:   ${COLORS.yellow}${trade.priceImpact.toFixed(4)}%${COLORS.reset}`);
  console.log(`  Size:           ${trade.amountIn} SOL`);
  console.log(`  Ruta:           ${COLORS.gray}${trade.route.join(" → ")}${COLORS.reset}`);
  console.log(`  Modo:           ${COLORS.bgYellow}${COLORS.bright} ${trade.mode} ${COLORS.reset}\n`);
}

export function logCrossDexPair(forwardDex: string, backwardDex: string, spreadPct: number, profitUsd: number, score: number, confidence: number): void {
  const spreadColor = spreadPct > 0 ? COLORS.green : COLORS.red;
  const scoreStr = score >= 7 ? "HIGH" : score >= 4 ? "MED" : "LOW";
  const scoreColor = score >= 7 ? COLORS.green : score >= 4 ? COLORS.yellow : COLORS.red;

  console.log(
    `  ${COLORS.cyan}${forwardDex}${COLORS.reset} → ${COLORS.cyan}${backwardDex}${COLORS.reset} | ` +
    `spread: ${spreadColor}${spreadPct.toFixed(4)}%${COLORS.reset} | ` +
    `profit: $${profitUsd.toFixed(4)} | ` +
    `conf: ${(confidence * 100).toFixed(0)}% | ` +
    `score: ${scoreColor}${scoreStr} (${score.toFixed(1)})${COLORS.reset}`
  );
}

export function logDexRoute(direction: string, dexes: string[], priceImpact: number): void {
  console.log(`  ${direction}: [${dexes.join(", ")}] | impact: ${priceImpact.toFixed(3)}%`);
}

export function logHealthMetrics(health: Record<string, unknown>): void {
  console.log(`\n${COLORS.gray}──────────── HEALTH METRICS ────────────${COLORS.reset}`);
  for (const [key, val] of Object.entries(health)) {
    console.log(`  ${key}: ${COLORS.cyan}${String(val)}${COLORS.reset}`);
  }
  console.log(`${COLORS.gray}────────────────────────────────────────${COLORS.reset}\n`);
}

export function logDryRunBlock(): void {
  console.log(`\n${COLORS.bgYellow}${COLORS.bright}╔══════════════════════════════════════════╗${COLORS.reset}`);
  console.log(`${COLORS.bgYellow}${COLORS.bright}║   🔒  DRY RUN — SIMULACIÓN COMPLETA      ║${COLORS.reset}`);
  console.log(`${COLORS.bgYellow}${COLORS.bright}║   ✅  Trade simulado exitosamente         ║${COLORS.reset}`);
  console.log(`${COLORS.bgYellow}${COLORS.bright}║   ❌  No se ejecutó transacción real      ║${COLORS.reset}`);
  console.log(`${COLORS.bgYellow}${COLORS.bright}╚══════════════════════════════════════════╝${COLORS.reset}\n`);
}

export function logBotHeader(dryRun: boolean): void {
  console.clear();
  console.log(`\n${COLORS.bright}${COLORS.cyan}  SOLANA ARB BOT v1.0 — FASE 1${COLORS.reset}\n`);

  if (dryRun) {
    console.log(`${COLORS.bgGreen}${COLORS.bright}   ✅  MODO: DRY RUN — SOLO SIMULACIÓN — SIN DINERO REAL  ${COLORS.reset}\n`);
  } else {
    console.log(`${COLORS.bgRed}${COLORS.bright}   🚨  MODO: LIVE TRADING — DINERO REAL EN JUEGO !!!       ${COLORS.reset}\n`);
  }
}

export function saveTradeLog(trade: TradeLog): void {
  try {
    let trades: TradeLog[] = [];
    if (fs.existsSync(TRADES_FILE)) {
      const raw = fs.readFileSync(TRADES_FILE, "utf-8");
      try { trades = JSON.parse(raw); if (!Array.isArray(trades)) trades = []; }
      catch { trades = []; }
    }
    trades.push(trade);
    if (trades.length > 5000) trades = trades.slice(-5000);
    fs.writeFileSync(TRADES_FILE, JSON.stringify(trades, null, 2), "utf-8");
  } catch (err) {
    logError("Error guardando trade log", err);
  }
}

export interface SessionMetrics {
  startTime: Date;
  checksCount: number;
  opportunitiesFound: number;
  totalProfitUsd: number;
  errorsCount: number;
}

export function printSessionMetrics(metrics: SessionMetrics): void {
  const uptimeMs = Date.now() - metrics.startTime.getTime();
  const uptimeSec = Math.floor(uptimeMs / 1000);
  const uptimeMin = Math.floor(uptimeSec / 60);
  const uptimeHr = Math.floor(uptimeMin / 60);
  const uptimeStr = uptimeHr > 0
    ? `${uptimeHr}h ${uptimeMin % 60}m ${uptimeSec % 60}s`
    : uptimeMin > 0 ? `${uptimeMin}m ${uptimeSec % 60}s` : `${uptimeSec}s`;

  console.log(`${COLORS.gray}─────────── MÉTRICAS DE SESIÓN ───────────${COLORS.reset}`);
  console.log(`  Uptime:              ${COLORS.cyan}${uptimeStr}${COLORS.reset}`);
  console.log(`  Checks realizados:   ${COLORS.cyan}${metrics.checksCount}${COLORS.reset}`);
  console.log(`  Oportunidades:       ${COLORS.green}${metrics.opportunitiesFound}${COLORS.reset}`);
  console.log(`  Profit teórico:      ${COLORS.green}$${metrics.totalProfitUsd.toFixed(4)}${COLORS.reset}`);
  console.log(`  Errores:             ${COLORS.red}${metrics.errorsCount}${COLORS.reset}`);
  console.log(`${COLORS.gray}──────────────────────────────────────────${COLORS.reset}\n`);
}

export function logSpread(pair: string, size: number, forwardDex: string, backwardDex: string, spreadPct: number, profitUsd: number, score: number, confidence: number): void {
  const spreadColor = spreadPct > 0 ? COLORS.green : COLORS.red;
  const scoreStr = score >= 7 ? "HIGH" : score >= 4 ? "MED" : "LOW";
  console.log(
    `${COLORS.gray}[${timestamp()}]${COLORS.reset} ` +
    `${COLORS.bright}${pair}${COLORS.reset} ` +
    `${COLORS.cyan}${forwardDex}→${backwardDex}${COLORS.reset} ` +
    `${spreadColor}${spreadPct.toFixed(4)}%${COLORS.reset} ` +
    `$${profitUsd.toFixed(4)} ` +
    `[${size} SOL] ` +
    `${COLORS.bright}${scoreStr}${COLORS.reset} ` +
    `conf:${(confidence * 100).toFixed(0)}%`
  );
}
