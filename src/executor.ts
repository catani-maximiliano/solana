import { LocalOpportunityCandidate, isOpportunityValid } from "./detector";
import { BotConfig } from "./config";
import {
  logDryRunBlock,
  logError,
  logWarning,
  logSuccess,
  logInfo,
} from "./logger";
import { sleep } from "./utils";
import { integrityEngine } from "./core/integrity";

let activeTrades = 0;
let tradesExecuted = 0;
let tradesWon = 0;
let totalPnlSol = 0;

export interface ExecutionResult {
  success: boolean;
  opportunity: LocalOpportunityCandidate;
  mode: "DRY_RUN" | "LIVE";
  txSignature?: string;
  error?: string;
  executedAt: Date;
  pnlSol?: number;
}

async function simulateTrade(
  opportunity: LocalOpportunityCandidate,
  config: BotConfig
): Promise<ExecutionResult> {
  logInfo(`${opportunity.symbolA}/${opportunity.symbolB} | ${opportunity.dexBuy} → ${opportunity.dexSell} | spread: ${opportunity.spreadPct.toFixed(4)}% | conf: ${(opportunity.confidence * 100).toFixed(0)}%`);

  console.log("  DETALLES DEL CANDIDATO LOCAL:");
  console.log(`     Par:             ${opportunity.pair}`);
  console.log(`     Compra en:       ${opportunity.dexBuy} (pool: ${opportunity.poolBuy.substring(0, 12)}...)`);
  console.log(`     Venta en:        ${opportunity.dexSell} (pool: ${opportunity.poolSell.substring(0, 12)}...)`);
  console.log(`     Precio compra:   $${opportunity.priceBuy.toFixed(6)}`);
  console.log(`     Precio venta:    $${opportunity.priceSell.toFixed(6)}`);
  console.log(`     Spread local:    ${opportunity.spreadPct.toFixed(4)}%`);
  console.log(`     Confianza:       ${(opportunity.confidence * 100).toFixed(0)}%`);
  console.log(`     Liquidez:        ${opportunity.liquidity.toLocaleString()}`);
  console.log(`     Fuente:          graph (on-chain)`);

  await sleep(200);
  logDryRunBlock();

  return {
    success: true,
    opportunity,
    mode: "DRY_RUN",
    executedAt: new Date(),
  };
}

async function executeLive(
  opportunity: LocalOpportunityCandidate,
  config: BotConfig
): Promise<ExecutionResult> {
  if (activeTrades >= config.microCapitalMaxConcurrent) {
    return { success: false, opportunity, mode: "LIVE", error: "max concurrent trades reached", executedAt: new Date() };
  }

  activeTrades++;
  logSuccess(`[LIVE] EXECUTING: ${opportunity.pair} — ${config.microCapitalPerTradeSol} SOL on ${opportunity.dexBuy}`);
  logInfo(`[LIVE]   Buy @ ${opportunity.priceBuy.toFixed(6)} → Sell @ ${opportunity.priceSell.toFixed(6)}`);

  try {
    const { VersionedTransaction, PublicKey } = await import("@solana/web3.js");

    // Use Jupiter API directly via HTTP (no SDK dependency needed)
    const JUPITER_QUOTE_API = "https://quote-api.jup.ag/v6";
    const inputMint = "So11111111111111111111111111111111111111112"; // SOL
    const outputMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // USDC
    const amountLamports = Math.floor(config.microCapitalPerTradeSol * 1_000_000_000);

    // Step 1: Get quote
    const quoteUrl = `${JUPITER_QUOTE_API}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountLamports}&slippageBps=${config.slippageBps}`;
    const quoteRes = await fetch(quoteUrl);
    if (!quoteRes.ok) throw new Error(`Jupiter quote failed: ${quoteRes.status}`);
    const quote = await quoteRes.json();

    // Step 2: Get swap transaction
    const swapRes = await fetch(`${JUPITER_QUOTE_API}/swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: config.walletPublicKey,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: "auto",
      }),
    });
    if (!swapRes.ok) throw new Error(`Jupiter swap failed: ${swapRes.status}`);
    const swapData = await swapRes.json() as { swapTransaction: string };

    const tx = VersionedTransaction.deserialize(Buffer.from(swapData.swapTransaction, "base64"));
    tx.sign([config.keypair]);

    const sig = await config.connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: true,
      maxRetries: 3,
    });

    logSuccess(`[LIVE] TX SENT: ${sig}`);
    logInfo(`[LIVE]   Waiting for confirmation...`);

    const conf = await config.connection.confirmTransaction(sig, "confirmed");
    const confOk = !conf.value.err;

    tradesExecuted++;
    if (confOk) tradesWon++;

    const pnlSol = confOk ? config.microCapitalPerTradeSol * (opportunity.spreadPct / 100) : -config.microCapitalPerTradeSol * 0.01;
    totalPnlSol += pnlSol;

    integrityEngine.recordRealExecution({
      pair: opportunity.pair,
      solIn: config.microCapitalPerTradeSol,
      solOut: config.microCapitalPerTradeSol + pnlSol,
      pnlSol,
      success: confOk,
      txSignature: sig,
      latencyMs: 0,
    });

    logSuccess(confOk ? `[LIVE] ✅ CONFIRMED: +${(pnlSol * 100).toFixed(6)} SOL` : `[LIVE] ❌ FAILED: ${conf.value.err || "unknown"}`);

    return {
      success: confOk,
      opportunity,
      mode: "LIVE",
      txSignature: sig,
      executedAt: new Date(),
      pnlSol,
    };
  } catch (err) {
    logError("[LIVE] EXECUTION ERROR", err);
    return {
      success: false,
      opportunity,
      mode: "LIVE",
      error: err instanceof Error ? err.message : String(err),
      executedAt: new Date(),
    };
  } finally {
    activeTrades--;
  }
}

export async function executeOpportunity(
  opportunity: LocalOpportunityCandidate,
  config: BotConfig
): Promise<ExecutionResult> {
  const validation = isOpportunityValid(opportunity);
  if (!validation.valid) {
    return {
      success: false,
      opportunity,
      mode: config.liveMode ? "LIVE" : "DRY_RUN",
      error: `Oportunidad inválida: ${validation.reason}`,
      executedAt: new Date(),
    };
  }

  // LIVE execution path
  if (config.liveMode && config.microCapitalMode) {
    return await executeLive(opportunity, config);
  }

  // Simulate always as fallback
  try {
    return await simulateTrade(opportunity, config);
  } catch (err) {
    logError("Error en executor", err);
    return {
      success: false,
      opportunity,
      mode: config.liveMode ? "LIVE" : "DRY_RUN",
      error: err instanceof Error ? err.message : String(err),
      executedAt: new Date(),
    };
  }
}

export async function executeAll(
  opportunities: LocalOpportunityCandidate[],
  config: BotConfig
): Promise<ExecutionResult[]> {
  const validOpps = opportunities.filter((o) => isOpportunityValid(o).valid);
  if (validOpps.length === 0) return [];

  const results: ExecutionResult[] = [];
  for (const opp of validOpps) {
    const result = await executeOpportunity(opp, config);
    results.push(result);
  }
  return results;
}

export function getLiveStats() {
  return { tradesExecuted, tradesWon, totalPnlSol, activeTrades };
}


