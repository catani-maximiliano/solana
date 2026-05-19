import { LocalOpportunityCandidate, isOpportunityValid } from "./detector";
import { BotConfig } from "./config";
import {
  logDryRunBlock,
  logError,
  logWarning,
  logInfo,
} from "./logger";
import { sleep } from "./utils";

const LIVE_TRADING_ENABLED = false;

export interface ExecutionResult {
  success: boolean;
  opportunity: LocalOpportunityCandidate;
  mode: "DRY_RUN" | "LIVE";
  txSignature?: string;
  error?: string;
  executedAt: Date;
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

export async function executeOpportunity(
  opportunity: LocalOpportunityCandidate,
  config: BotConfig
): Promise<ExecutionResult> {
  if ((LIVE_TRADING_ENABLED as boolean) === true) {
    throw new Error(
      "LIVE_TRADING_ENABLED está activado pero Fase 1 no lo permite. " +
        "Este error es intencional para proteger tu capital."
    );
  }

  if (!config.dryRun) {
    logWarning(
      "DRY_RUN desactivado en config, LIVE_TRADING_ENABLED=false. Forzando simulación..."
    );
  }

  const validation = isOpportunityValid(opportunity);
  if (!validation.valid) {
    return {
      success: false,
      opportunity,
      mode: "DRY_RUN",
      error: `Oportunidad inválida: ${validation.reason}`,
      executedAt: new Date(),
    };
  }

  try {
    return await simulateTrade(opportunity, config);
  } catch (err) {
    logError("Error en executor (simulación)", err);
    return {
      success: false,
      opportunity,
      mode: "DRY_RUN",
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


