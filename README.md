# Solana Arb Bot — Fase 1 (DRY RUN / Market Intelligence)

> **Este bot funciona EXCLUSIVAMENTE en modo simulación. No ejecuta transacciones reales.**

Bot de detección de oportunidades de arbitraje cross-DEX en Solana. Se conecta a la Jupiter API para obtener quotes en tiempo real, analiza rutas entre DEXs, calcula spreads con validación temporal y genera señales con score de confianza — todo en simulación segura (DRY RUN).

## Stack

- Node.js v18+
- TypeScript 5 (strict mode, noImplicitAny)
- @solana/web3.js
- Jupiter Quote API v1 (lite-api)
- Axios

## Arquitectura

```
solana-arb-bot/
├── src/
│   ├── index.ts             ← Loop principal, health metrics, graceful shutdown
│   ├── config.ts            ← Configuración y validación de .env
│   ├── circuit-breaker.ts   ← Protección: degradación automática por fallos/latencia/429
│   ├── scheduler.ts         ← Planificador: priorización dinámica de pares, budget manager
│   ├── rate-limiter.ts      ← Token bucket: bursting inteligente, cooldown exponencial, cache real
│   ├── detector.ts          ← Detector: quotes paralelos, validación temporal, spread persistence
│   ├── executor.ts          ← Executor (solo simulación, bloqueado para live trading)
│   ├── analytics.ts         ← Analytics: spread half-life, tendencias, eficiencia, confianza
│   ├── logger.ts            ← Logging profesional, persistencia en trades.json
│   ├── market/              ← Capa de market data (provider pattern)
│   │   ├── types.ts         ← MarketDataProvider interface, PriceQuote, QuoteRequest
│   │   ├── jupiter-provider.ts  ← Implementación Jupiter API con fallback
│   │   ├── pool-provider.ts ← Placeholder para lectura directa on-chain (Raydium, Meteora, Whirlpool)
│   │   └── index.ts         ← Barrel exports
│   └── utils/
│       └── index.ts         ← sleep, retry, avg, median, clamp, truncate
├── data/
│   └── trades.json          ← Historial de oportunidades detectadas (hasta 5000)
├── logs/                    ← Logs de sesión
├── .env                     ← Variables de entorno (no subir a git)
├── .env.example             ← Plantilla de configuración
└── tsconfig.json
```

## Setup

```bash
# 1. Instalar dependencias
npm install

# 2. Copiar y configurar .env
cp .env.example .env
# Edita .env con tu RPC_URL

# 3. Correr en modo desarrollo
npm run dev

# 4. O compilar y ejecutar
npm run build && npm start
```

## Variables de entorno

| Variable | Descripción | Default |
|---|---|---|
| `PRIVATE_KEY` | Clave privada base58 (solo para Fase 2+) | Requerida |
| `RPC_URL` | URL del nodo RPC de Solana | Requerida |
| `MIN_PROFIT_USD` | Profit mínimo en USD para considerar válida | `0.05` |
| `MAX_TRADE_SOL` | Tamaño máximo de trade en SOL | `0.1` |
| `SLIPPAGE_BPS` | Slippage en basis points (50 = 0.5%) | `50` |
| `CHECK_INTERVAL_MS` | Intervalo entre scans en ms | `3000` |
| `DEBUG_MODE` | Muestra quotes raw, DEXs, spreads detallados | `false` |
| `QUOTE_SIZES` | Tamaños de prueba separados por coma (máx 2 usados) | `0.05,0.1` |
| `MAX_QUOTE_AGE_MS` | Gap máximo forward/backward en ms | `1500` |
| `MAX_REQUESTS_PER_MIN` | Request budget a Jupiter API | `60` |
| `PERSISTENCE_REQUIRED` | Scans consecutivos para confianza media | `2` |
| `DRY_RUN` | Modo simulación (siempre `true` en Fase 1) | `true` |

## Core Architecture

### 1. Token Bucket Rate Limiter (`rate-limiter.ts`)
- **Token bucket**: burst de hasta 6 requests concurrentes, refill a 1 token/s
- **Cache real**: TTL 2s, deduplicación de quotes idénticas
- **Cooldown exponencial**: 15s → 30s → 60s → 120s con jitter ±25%
- **Pacing post-cooldown**: liberación gradual (no dump de toda la queue)
- **Métricas**: tokens disponibles, queue depth, active count, cache hits/size

### 2. Circuit Breaker (`circuit-breaker.ts`)
- Umbrales: 5 fallos consecutivos, 3 rate limit spikes, 5000ms latencia, 20 queue depth
- Degradación automática: reduce concurrencia y frecuencia de scans
- Recuperación gradual: decay de contadores cada 30s sin incidentes

### 3. Scheduler Inteligente (`scheduler.ts`)
- Priorización dinámica de pares según histórico de oportunidades
- Dead pair detection: deshabilita pares sin spreads tras 20 scans
- Budget estimation: calcula requests necesarios antes de cada scan
- Degradation-aware: reduce pares/sizes en modo degradado
- Adaptive quote sizing: selecciona 2 tamaños óptimos (smallest + closest to maxTradeSol)

### 4. Detector con Validación Temporal (`detector.ts`)
- **Quotes paralelos**: Promise.all por pares, batching batch 1 (forward) + batch 2 (backward)
- **MAX_QUOTE_AGE_MS**: descarta spreads si forward/backward están separados >1500ms
- **Spread persistence**: requiere N scans consecutivos (configurable) para confianza
- **Confidence score**: combina persistencia, stale ratio, tendencia
- **Cross-DEX detection**: identifica DEXs diferentes en routePlan (forward ≠ backward)
- Solo 2 tamaños por par (vs 4 anteriores) — reduce requests ~50%

### 5. Market Data Layer (`market/`)
- `MarketDataProvider` interface: preparada para múltiples fuentes
- `JupiterProvider`: endpoints primario (lite-api) + fallback (api), User-Agent, error classification
- `DexPoolReader` interface: placeholders para Raydium CLMM, Meteora, Whirlpool
- Fácil migración futura a lectura directa on-chain

### 6. Analytics Mejorado (`analytics.ts`)
- **Spread half-life**: tiempo que tarda un spread en caer a la mitad
- **Request efficiency**: oportunidades / requests totales
- **Stale quote ratio**: % de quotes descartadas por age
- **Latency distribution**: avg, p50, p95, p99
- **DEX reliability**: ratio éxito/fallo por combinación DEX
- **Confidence scoring**: persistencia, stale ratio, tendencia

## Sistema de Scoring

```
Score = profitScore + spreadScore) × dexDiversity − impactPenalty − latencyPenalty
```

| Componente | Peso |
|---|---|
| Profit (USD × 20) | Hasta +4 pts |
| Spread (% × 10) | Hasta +4 pts |
| Diversidad DEX (1.0× o 1.5×) | Multiplicador |
| Price impact (penalidad × 2) | Hasta −4 pts |
| Latencia (/ 500ms) | Hasta −3 pts |

Validación adicional:
- **Quote age**: gap forward/backward ≤ 1500ms
- **Confianza**: ≥ 30% (basado en persistencia multi-scan)
- **DEX diversity**: forward ≠ backward (sin arbitraje intra-Jupiter)
- **Persistence**: spread detectado en N scans consecutivos

## Reportes

### Health metrics (cada 10 checks)
```
──────────── HEALTH METRICS ────────────
  Requests:    42 (OK: 40, Fail: 2)
  Success:     95.2%
  Avg Latency: 312ms
  Efficiency:  4.76% ops/req
  Stale ratio: 2.4%
  Rate Limits: 0
────────────────────────────────────────
```

### Analytics report (cada 20 checks)
```
========== ANALYTICS REPORT ==========
  Requests: 84 | OK: 80 | Fail: 4 | Rate: 95.2%
  Latency: avg=312ms p50=280ms p95=890ms | Limits: 0
  Efficiency: 4.76% ops/req | Stale ratio: 2.4%
  --- Pairs ---
  SOL/USDC | checks: 20 | opps: 2 | avgSpread: 0.0123% | profit: $0.0234 ↑ | conf: 40% | stale: 5%
  --- DEX Combinations ---
  Raydium → Orca | appearances: 15 | avgSpread: 0.0234% | profit: $0.1567 | reliability: 100%
  Best Pair: SOL/USDC ($0.0234)
  Best DEX: Raydium → Orca ($0.1567)
  Total spreads tracked: 150
========== END REPORT ==========
```

## Cambios Respecto a la Versión Anterior

| Aspecto | Antes | Ahora |
|---|---|---|
| Scans | Serial (14s+) | Paralelo con Promise.all (<3s) |
| Sizes por par | 4 fijos | 2 adaptativos |
| Requests/scan | ~64 | ~32 (con cache, ~20 reales) |
| Rate limiter | Queue simple | Token bucket con burst |
| Cache | 0 hits | TTL 2s, deduplicación real |
| Cooldown | 15→30→60s, dump | 15→30→60→120s, gradual |
| Validación temporal | No | MAX_QUOTE_AGE_MS 1500ms |
| Spread persistence | No | Sí, multi-scan confidence |
| Circuit breaker | No | Sí, degradación automática |
| Scheduler | No | Sí, priorización dinámica |
| Market providers | Solo Jupiter | Interface + placeholders |
| Detector | Jupiter→Jupiter | Cross-DEX real |
| Monitor.ts | Archivo monolítico | market/jupiter-provider.ts |

## Protecciones de seguridad

- `DRY_RUN=true` forzado por defecto
- `LIVE_TRADING_ENABLED=false` hardcodeado en executor.ts
- Circuit breaker con degradación automática
- No se firma ninguna transacción
- No se envía nada a la blockchain
- No se usa Jito, bundles, MEV, flash loans

## Roadmap

- **Fase 1** ✅ — Market Intelligence: cross-DEX, analytics, rate limiter, circuit breaker, scheduler
- **Fase 2** — Ejecución real con Jito MEV (cuando las señales sean consistentes)
- **Fase 3** — Lectura directa on-chain (Raydium CLMM, Meteora, Whirlpool)
- **Fase 4** — Optimización y escalado con WebSockets

## Logs (data/trades.json)

```json
[
  {
    "timestamp": "2024-01-01T00:00:00.000Z",
    "mode": "DRY_RUN",
    "pair": "SOL/USDC",
    "dexOrigin": "Raydium",
    "dexDestination": "Orca",
    "spreadPct": 0.0234,
    "confidence": 0.4,
    "quoteAgeMs": 312,
    "grossProfitUsd": 0.0245,
    "estimatedFeesUsd": 0.000001,
    "score": 6.2,
    "amountIn": 0.1,
    "profitUsd": 0.0523,
    "priceImpact": 0.0012,
    "route": ["Raydium", "↔", "Orca"],
    "executed": false
  }
]
```
