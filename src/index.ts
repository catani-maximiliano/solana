import { config } from "./config";
import { detectOpportunities, isOpportunityValid } from "./detector";
import { executeAll } from "./executor";
import {
  logInfo, logError, logSuccess, logWarning, logBotHeader, logHealthMetrics, printSessionMetrics, SessionMetrics, logDebug,
} from "./logger";
import { sleep } from "./utils";
import { analytics } from "./analytics";
import { rateLimiter } from "./rate-limiter";
import { circuitBreaker } from "./circuit-breaker";
import { eventBus } from "./events";
import { WebSocketManager } from "./ws";
import { marketState, WhirlpoolProvider } from "./market";
import { pairState } from "./pair-state";
import { priceGraph } from "./graph";
import { surfaceEngine, executableDetector, printNetworkReport } from "./engine";
import { eventScheduler } from "./scheduler";
import { marketValidator } from "./market-validator";
import { POOL_REGISTRY, getPoolSummary } from "./config/pools";
import { sqrtPriceX64ToPrice } from "./math";
import { stateConsistency } from "./state-consistency";
import { Scanner, tokenDiscovery, quoteEngine } from "./scanner";

let wsManager: WebSocketManager | null = null;
let scanner: Scanner | null = null;
let startupOk = true;
let startupErrors: string[] = [];

function recordStartup(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    logSuccess(`  ✅ ${label}${detail ? `: ${detail}` : ""}`);
  } else {
    logWarning(`  ❌ ${label}${detail ? `: ${detail}` : ""}`);
    startupErrors.push(`${label}: ${detail || "falló"}`);
  }
}

async function checkRpcConnectivity(): Promise<boolean> {
  logInfo("Paso 1: Verificando RPC...");
  try {
    const startTime = Date.now();
    const slot = await config.connection.getSlot();
    const latency = Date.now() - startTime;
    const version = await config.connection.getVersion();
    recordStartup("RPC conectado", true, `slot ${slot} | ${version["solana-core"]} | ${latency}ms`);
    return true;
  } catch (err) {
    recordStartup("RPC conectado", false, err instanceof Error ? err.message : String(err));
    return false;
  }
}

async function verifyWebSocket(): Promise<boolean> {
  logInfo("Paso 2: Conectando WebSocket...");
  wsManager = new WebSocketManager(config.connection);
  const wsOk = await wsManager.start();
  recordStartup("WS conectado", wsOk, wsOk ? `subs: ${wsManager.getSubscriptionsCount()}` : "reintentará automáticamente");
  return wsOk;
}

async function attachWsToProviders(): Promise<void> {
  logInfo("Paso 3: Asociando WS Manager a providers...");
  if (!wsManager) {
    logWarning("  WS Manager no disponible — providers no podrán subscribirse");
    return;
  }
  for (const provider of config.directPoolProviders) {
    if ("attachWs" in provider) {
      (provider as any).attachWs(wsManager);
      logDebug(`  ${provider.dexName}: WS asociado`);
    }
  }
}

async function startProviders(): Promise<void> {
  logInfo("Paso 4: Iniciando providers...");
  for (const provider of config.directPoolProviders) {
    try {
      marketValidator.registerProvider(provider.dexName);
      const ok = await provider.start();
      recordStartup(`${provider.dexName} iniciado`, ok, ok ? "programa válido" : "programa no encontrado (sub directa igualmente)");
    } catch (err) {
      recordStartup(`${provider.dexName} iniciado`, false, err instanceof Error ? err.message : String(err));
    }
  }
}

async function subscribePools(): Promise<number> {
  logInfo("Paso 5: Subscribiendo pools...");
  if (POOL_REGISTRY.length === 0) {
    logWarning("  Pool registry vacío — no hay pools para subscribir");
    return 0;
  }

  for (const entry of POOL_REGISTRY) {
    pairState.registerPool(entry.pair, entry.address);
    const pair = pairState.getPair(entry.pair);
    if (pair && !pair.poolAddresses.includes(entry.address)) {
      pair.poolAddresses.push(entry.address);
    }

    marketState.registerPoolFromRegistry(entry.address, entry.mintA, entry.mintB, entry.dex, entry.decimalsA, entry.decimalsB);

    priceGraph.seedFromRegistry(entry.address, entry.mintA, entry.mintB, entry.dex);
  }

  recordStartup("Pool registry cargado", true, getPoolSummary());

  let subscribed = 0;
  let providerSubscribed = 0;

  for (const provider of config.directPoolProviders) {
    if (!("trackPool" in provider)) continue;

    const poolAddrs = POOL_REGISTRY.filter((p) => p.dex === provider.dexName);
    logDebug(`  ${provider.dexName}: ${poolAddrs.length} pools para subscribir`);

    for (const pool of poolAddrs) {
      try {
        logInfo(`  Subscribiendo pool ${pool.address.substring(0, 12)}... via ${provider.dexName}`);
        await (provider as any).trackPool(pool.address, pool.feeBps);
        providerSubscribed++;
      } catch (err) {
        logWarning(`  trackPool falló para ${pool.address.substring(0, 12)}... — ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  for (const entry of POOL_REGISTRY) {
    if (wsManager && entry.address) {
      const isWhirlpool = entry.dex === "Whirlpool";
      logDebug(`  WS subscription directa para ${entry.address.substring(0, 12)}... (${entry.dex})`);
      const subKey = wsManager.subscribeAccount(entry.address, (data, slot) => {
        if (!data || data.length < 150) return;
        if (isWhirlpool) {
          const parsed = parseWsUpdateDirect(data);
          if (!parsed) return;
          const { sqrtPrice, liquidity, tickCurrentIndex } = parsed;
          if (sqrtPrice && liquidity !== undefined) {
            const snapshot: import("./market/state-cache").PoolStateSnapshot = {
              poolAddress: entry.address,
              dex: entry.dex,
              mintA: entry.mintA,
              mintB: entry.mintB,
              decimalsA: entry.decimalsA,
              decimalsB: entry.decimalsB,
              sqrtPriceX64: sqrtPrice.toString(),
              liquidity: liquidity.toString(),
              tick: tickCurrentIndex,
              fee: entry.feeBps,
              slot,
              timestamp: Date.now(),
              dataQuality: "VALID",
              source: "ON_CHAIN_VALIDATED",
            };
            marketState.updatePool(snapshot);
            const pool = marketState.getPool(entry.address);
            if (pool) priceGraph.updateFromPool(pool);
            logDebug(`WS direct [${entry.address.substring(0, 8)}]: slot=${slot} update → cache: ${marketState.getPoolCount()} pools`);
          }
        }
      }, "confirmed");
      if (subKey) {
        subscribed++;
        logDebug(`  ✅ WS subscription directa creada: ${subKey}`);
      } else {
        logWarning(`  ❌ WS subscription directa NO creada para ${entry.address.substring(0, 12)}...`);
      }
    }
  }

  logInfo(`  Provider subscriptions: ${providerSubscribed} | WS direct subscriptions: ${subscribed}`);

  if (subscribed > 0 || providerSubscribed > 0) {
    const total = subscribed + providerSubscribed;
    recordStartup("Pool subscriptions activas", true, `${total} total`);
  } else {
    recordStartup("Pool subscriptions activas", false, "0 subscriptions creadas");
  }

  return subscribed + providerSubscribed;
}

function parseWsUpdateDirect(data: Buffer): { sqrtPrice: bigint; liquidity: bigint; tickCurrentIndex: number } | null {
  try {
    if (data.length < 85) {
      logDebug(`WS parse: datos insuficientes (${data.length} bytes, mínimo 85)`);
      return null;
    }

    const DEBUG_MODE = process.env.DEBUG_MODE === "true";
    if (DEBUG_MODE) {
      const hexDump = (start: number, len: number) =>
        data.subarray(start, start + len).toString("hex").match(/.{1,2}/g)?.join(" ") || "";
      logDebug(`WS data: ${data.length} bytes`);
      logDebug(`hex[40..50] (bump+spacing+seed+rate): ${hexDump(40, 10)}`);
      logDebug(`hex[49..64] (liquidity u128):         ${hexDump(49, 16)}`);
      logDebug(`hex[65..80] (sqrt_price u128):        ${hexDump(65, 16)}`);
      logDebug(`hex[81..84] (tick i32):               ${hexDump(81, 4)}`);
      logDebug(`hex[101..132] (token_mint_a):         ${hexDump(101, 32)}`);
    }

    const liquidityLow = data.readBigUInt64LE(49);
    const liquidityHigh = data.readBigUInt64LE(57);
    const liquidity = (liquidityHigh << 64n) | liquidityLow;

    const sqrtPriceLow = data.readBigUInt64LE(65);
    const sqrtPriceHigh = data.readBigUInt64LE(73);
    const sqrtPrice = (sqrtPriceHigh << 64n) | sqrtPriceLow;

    const tickCurrentIndex = data.readInt32LE(81);

    if (sqrtPrice === 0n) {
      logDebug(`WS parse: sqrtPrice=0 — NO actualizando`);
      return null;
    }

    if (tickCurrentIndex < -500000 || tickCurrentIndex > 500000) {
      logDebug(`WS parse: tick=${tickCurrentIndex} fuera de rango — INVALIDANDO`);
      return null;
    }

    const sqrtNum = Number(sqrtPrice);
    const sqrtApprox = sqrtNum / 2 ** 64;
    if (sqrtApprox > 1e10 || (sqrtApprox > 0 && sqrtApprox < 1e-8)) {
      logDebug(`WS parse: sqrtPriceQ64=${sqrtPrice.toString()} (≈${sqrtApprox.toExponential(2)}) fuera de rango — INVALIDANDO`);
      return null;
    }

    if (liquidity === 0n) {
      logDebug(`WS parse: liquidity=0 — pool vacío`);
      return null;
    }

    const liqNum = Number(liquidity);
    if (!isFinite(liqNum) || liqNum > 1e18) {
      logDebug(`WS parse: liquidity=${liqNum.toExponential(2)} absurda — INVALIDANDO`);
      return null;
    }

    if (DEBUG_MODE) {
      logDebug(`WS parse OK: sqrtPriceQ64=${sqrtPrice.toString()} tick=${tickCurrentIndex} liq=${liquidity.toString()}`);
    }

    return { sqrtPrice, liquidity, tickCurrentIndex };
  } catch {
    return null;
  }
}

async function verifyMarketCache(timeoutMs: number = 10000): Promise<boolean> {
  logInfo("Paso 6: Esperando market data...");
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const pools = marketState.getPoolCount();
    const pairs = marketState.getPairCount();
    const updates = marketState.getStats().updates;

    if (pools > 0 && updates > 0) {
      recordStartup("Market data recibida", true, `${pools} pools, ${pairs} pares, ${updates} updates`);
      return true;
    }

    if (wsManager) {
      const wsMetrics = wsManager.getMetrics();
      if (wsMetrics.subscriptionsCount > 0 && wsMetrics.updatesPerSec > 0) {
        logDebug(`  Esperando... pools=${pools} subs=${wsMetrics.subscriptionsCount} updates=${updates} ws_updates=${wsMetrics.updatesPerSec.toFixed(1)}/s`);
      }
    }

    await sleep(500);
  }

  const finalPools = marketState.getPoolCount();
  const finalUpdates = marketState.getStats().updates;
  recordStartup("Market data recibida", finalPools > 0, `${finalPools} pools, ${finalUpdates} updates (timeout ${timeoutMs / 1000}s)`);
  return finalPools > 0;
}

async function initialize(): Promise<boolean> {
  logBotHeader(config.dryRun);
  console.log("═══════════════════════════════════════════════");
  console.log("  SOLANA MARKET INTELLIGENCE SYSTEM");
  console.log("  PIPELINE ON-CHAIN END-TO-END");
  console.log("═══════════════════════════════════════════════\n");

  analytics.reset();

  const rpcOk = await checkRpcConnectivity();
  const wsOk = await verifyWebSocket();

  await attachWsToProviders();
  await startProviders();
  const subCount = await subscribePools();

  const unsubEventBus = eventBus.subscribe("pool:update", (event) => {
    const data = event.data as any;
    if (data?.poolAddress) {
      const pool = marketState.getPool(data.poolAddress);
      if (pool) {
        priceGraph.updateFromPool(pool);
        logDebug(`EventBus → Graph: ✅ ${pool.poolAddress.substring(0, 8)}... updated (${priceGraph.getNodeCount()} nodes, ${priceGraph.getEdgeCount()} edges)`);
      } else {
        logDebug(`EventBus → Graph: pool ${data.poolAddress.substring(0, 8)}... not in cache yet`);
      }
    }
  });

  eventScheduler.enableWatchdog(wsManager ?? undefined);

  const dataOk = await verifyMarketCache(12000);

  marketValidator.recordValidData();

  scanner = new Scanner(config.connection, {
    minLiquidityUsd: config.scanMinLiquidityUsd,
    profitMultiplier: config.scanProfitMultiplier,
    pairsPerScan: config.scanMaxPairs,
    enableTriangular: config.scanEnableTriangular,
    quoteSizeLamports: Math.floor(config.scanQuoteSizeSol * 1_000_000_000),
  });
  tokenDiscovery.start();

  console.log("\n═══════════════════════════════════════════════");
  console.log("  STARTUP VERIFICATION");
  console.log("═══════════════════════════════════════════════");

  const wsMetrics = wsManager?.getMetrics();
  const cacheStats = marketState.getStats();
  const graphNodes = priceGraph.getNodeCount();
  const graphEdges = priceGraph.getEdgeCount();

  console.log(`  RPC:                    ${rpcOk ? "✅" : "❌"}`);
  console.log(`  WS:                     ${wsOk ? "✅" : "❌"}`);
  console.log(`  WS subs:                ${wsMetrics?.subscriptionsCount || 0}`);
  console.log(`  Pool registry:          ${POOL_REGISTRY.length} pools`);
  const multiPoolPairs = [...new Set(POOL_REGISTRY.filter((p, i, arr) => arr.findIndex((x) => x.pair === p.pair) !== i).map((p) => p.pair))];
  if (multiPoolPairs.length > 0) {
    console.log(`  Multi-pool pairs:       ${multiPoolPairs.join(", ")}`);
  }
  for (const p of POOL_REGISTRY) {
    console.log(`    ${p.dex}: ${p.address.substring(0, 12)}... (${p.pair})`);
  }

  for (const p of config.directPoolProviders) {
    const label = p.dexName;
    let state = "?";
    if ("getStateLabel" in p) state = (p as any).getStateLabel();
    else if ("getParseFailures" in p) state = p.isAvailable() ? "✅" : "❌";
    console.log(`  ${label}:             ${state}`);
  }

  console.log(`  Market cache:           ${cacheStats.pools} pools, ${cacheStats.pairs} pares, ${cacheStats.updates} updates`);
  console.log(`  Graph:                  ${graphNodes} nodos, ${graphEdges} edges`);
  console.log(`  Market providers:       ${config.marketProviders.length} registrados`);

  const quality = marketValidator.getSignalQuality();
  console.log(`  Signal quality:         ${quality}`);

  const startupConsistency = stateConsistency.check(marketState, priceGraph);
  stateConsistency.printReport(startupConsistency);

  if (cacheStats.pools > 0 && cacheStats.updates > 0) {
    logSuccess("\n✅ DATA PLANE REAL ACTIVO — Pipeline on-chain funcionando");
  } else {
    logWarning("\n⚠️  DATA PLANE INACTIVO — Sin market data real. Verifica RPC y WS connectivity.");
    if (!wsOk) logWarning("  Causa probable: WebSocket no conectado");
    if (wsMetrics?.subscriptionsCount === 0) logWarning("  Causa probable: 0 subscriptions WS");
    if (wsMetrics?.subscriptionsCount === 0 && wsOk) logWarning("  Sugerencia: el RPC público puede no soportar onAccountChange. Usa Helius/QuickNode.");
  }

  console.log("═══════════════════════════════════════════════\n");

  if (config.dryRun) logSuccess("DRY RUN ACTIVADO — NO se enviarán transacciones reales");
  if (!rpcOk) { logError("RPC no disponible. Abortando."); return false; }

  if (wsManager) {
    const interval = setInterval(() => {
      for (const p of config.directPoolProviders) {
        if ("checkHealth" in p) (p as any).checkHealth();
      }
    }, 15000);
    if (typeof (global as any).__healthInterval !== "undefined") clearInterval((global as any).__healthInterval);
    (global as any).__healthInterval = interval;
  }

  logInfo(`Loop principal iniciado — cada ${config.checkIntervalMs}ms`);
  return true;
}

async function mainLoop(): Promise<void> {
  const metrics: SessionMetrics = {
    startTime: new Date(), checksCount: 0, opportunitiesFound: 0, totalProfitUsd: 0, errorsCount: 0,
  };

  let analyticsCountdown = 20;
  let healthCountdown = 5;
  let poolCleanupCountdown = 30;
  let marketStatusCountdown = 10;

  while (true) {
    try {
      metrics.checksCount++;
      const effectiveInterval = circuitBreaker.getRecommendedInterval(config.checkIntervalMs);

      const startTime = Date.now();
      analytics.recordCheck();
      const opportunities = await detectOpportunities(config);

      const validOpps = opportunities.filter((o) => isOpportunityValid(o).valid);
      if (validOpps.length > 0) {
        const results = await executeAll(opportunities, config);
        for (const r of results) {
          if (r.success) { analytics.recordOpportunity(0); metrics.opportunitiesFound++; }
        }
      }

      let scanResult = null;
      if (scanner && (metrics.checksCount % 3 === 0 || validOpps.length === 0)) {
        scanResult = await scanner.scan();
        for (const opp of scanResult.opportunities) {
          if (opp.route.profitEstimate?.isProfitable) {
            logSuccess(`Scanner: ${opp.pairLabel} net=$${opp.route.profitEstimate.netProfitUsd.toFixed(6)} score=${opp.score} ${opp.isGraphValidated ? "(graph ✅)" : ""}`);
          }
        }
      }

      const elapsed = Date.now() - startTime;
      const wsMetrics = wsManager?.getMetrics();
      const cacheStats = marketState.getStats();
      const scannerStats = scanner?.getStats();

      logInfo(`Check #${metrics.checksCount}: ${elapsed}ms | pools: ${cacheStats.pools} | ws: ${wsMetrics?.subscriptionsCount || 0} | opps: ${validOpps.length} | scanner: ${scannerStats?.pairs || 0} pairs / ${scannerStats?.totalOpportunities || 0} total`);

      analyticsCountdown--;
      healthCountdown--;
      poolCleanupCountdown--;
      marketStatusCountdown--;

      if (poolCleanupCountdown <= 0) {
        marketState.cleanup();
        poolCleanupCountdown = 30;
      }

      if (analyticsCountdown <= 0) {
        analytics.printStatsReport();
        analyticsCountdown = 20;
      }

      if (marketStatusCountdown <= 0) {
        marketValidator.printStatus();
        marketStatusCountdown = 30;
      }

      if (healthCountdown <= 0) {
        const health = analytics.getHealth();
        logInfo(`Health: pools=${health.pools} pairs=${health.pairs} updates=${health.updates}`);
        logInfo(`Graph: ${health.graphNodes} nodos, ${health.graphEdges} edges`);
        logInfo(`Detector: ${health.scans} scans, ${health.candidates} candidatos`);
        if (scanner) {
          const s = scanner.getStats();
          logInfo(`Scanner: ${s.scanCount} scans, ${s.totalOpportunities} opps, ${s.pairs} pares, ${s.tokens} tokens, ${s.routeStats.totalRoutesFound} rutas`);
        }
        logInfo(`RateLimiter: queue=${rateLimiter.getMetrics().queueDepth} active=${rateLimiter.getMetrics().activeCount} tokens=${rateLimiter.getMetrics().tokensAvailable}`);
        logInfo(`WS: ${wsMetrics?.connected ? "conectado" : "desconectado"} | slot: ${wsMetrics?.lastSlot || "?"} | lag: ${wsMetrics?.slotLag || "?"}ms`);
        logInfo(`WS subs: ${wsMetrics?.subscriptionsCount} | slot_upd: ${wsMetrics?.updatesPerSec.toFixed(1)}/s | acc_upd: ${wsMetrics?.accountUpdatesPerSec.toFixed(1)}/s`);

        if (cacheStats.pools > 0 && cacheStats.updates > 0) {
          const pool = marketState.getAllPools()[0];
          if (pool) {
            const spotPrice = sqrtPriceX64ToPrice(BigInt(pool.sqrtPriceX64), pool.decimalsA, pool.decimalsB);
            logInfo(`Pool ${pool.poolAddress.substring(0, 8)}...: price=$${spotPrice.toFixed(6)} tick=${pool.tick} liq=${Number(pool.liquidity).toLocaleString()} slot=${pool.slot} age=${(Date.now() - pool.timestamp) / 1000}s`);
          }
        }

        logInfo(`Market cache: ${health.pools} pools, ${health.pairs} pairs, ${health.updates} updates totales`);
        logInfo(`Graph: ${priceGraph.getNodeCount()} nodos, ${priceGraph.getValidEdgeCount()}/${priceGraph.getEdgeCount()} edges válidos`);

        const consistencyReport = stateConsistency.check(marketState, priceGraph);
        stateConsistency.printReport(consistencyReport);

        if (priceGraph.getEdgeCount() > 0) {
          priceGraph.printGraphSummary();
          printNetworkReport();
          for (const label of priceGraph.getPairSurfaceLabels()) {
            surfaceEngine.printSurfaceReport(label);
          }
        }

        const engStats = executableDetector.getStats();
        logInfo(`Engine: ${engStats.totalScans} scans, ${engStats.totalOpportunities} opps total, ${engStats.activeCandidates} activas`);
        const surfStats = surfaceEngine.getStats();
        logInfo(`Surface: ${surfStats.cachedSurfaces} surfaces cacheadas, ${surfStats.calculations} cálculos`);

        if (circuitBreaker.isDegraded()) {
          logWarning(`Circuit Breaker: DEGRADADO — ${circuitBreaker.getState().consecutiveFailures} fallos`);
        }

        analytics.resetWindow();
        rateLimiter.resetWindow();
        healthCountdown = 30;
      }

      printSessionMetrics(metrics);
      await sleep(effectiveInterval);
    } catch (err) {
      metrics.errorsCount++;
      logError("Error en loop principal", err);
      if (metrics.errorsCount % 5 === 0) {
        logWarning(`${metrics.errorsCount} errores. Esperando 30s...`);
        await sleep(30000);
      } else {
        await sleep(config.checkIntervalMs);
      }
    }
  }
}

function setupGracefulShutdown(): void {
  const shutdown = async (signal: string) => {
    console.log(`\n\n${signal} recibida`);
    logInfo("Cerrando...");
    analytics.printStatsReport();
    tokenDiscovery.stop();
    if ((global as any).__healthInterval) clearInterval((global as any).__healthInterval);
    if (wsManager) await wsManager.destroy();
    rateLimiter.destroy();
    circuitBreaker.destroy();
    eventBus.clear();
    eventScheduler.clear();
    for (const p of config.directPoolProviders) {
      if ("destroy" in p) (p as any).destroy();
    }
    logInfo("No se enviaron transacciones reales.");
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("uncaughtException", (err) => { logError("Error fatal", err); process.exit(1); });
  process.on("unhandledRejection", (reason) => { logError("Promise rechazada", reason); });
}

async function main(): Promise<void> {
  setupGracefulShutdown();
  try {
    const ready = await initialize();
    if (!ready) { logError("Inicialización fallida"); process.exit(1); }
    await mainLoop();
  } catch (err) {
    logError("Error fatal", err);
    process.exit(1);
  }
}

main();
