# Solana Cross-DEX Arbitrage Detector (Phase 1 — Dry Run / Simulation Only)

Sistema de detección de ineficiencias de mercado entre pools CLMM/DLMM en Solana. Escucha datos on-chain en tiempo real vía WebSocket, construye un grafo de precios, simula swaps y detecta oportunidades de arbitraje cross-DEX y triangular.

> **Fase 1**: Solo simulación/dry run. **No ejecuta transacciones reales**.

---

## Architecture Overview

```
                       ┌─────────────────────┐
                       │   WebSocketManager   │  ← onSlotUpdate + onAccountChange
                       └──────┬──────────────┘
                              │ raw account data
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   WhirlpoolProvider   RaydiumProvider      MeteoraProvider
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │ PoolStateSnapshot
                              ▼
                     ┌────────────────┐
                     │ MarketStateCache│  ← dedup, slot coherence, age filter
                     └───────┬────────┘
                             │ PoolStateSnapshot
                             ▼
                     ┌────────────────┐
                     │   PriceGraph   │  ← nodes (tokens), edges (pools)
                     └───────┬────────┘
                             │ MarketSurface
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
      SpreadEngine   ExecutableDetector  PathBuilder
              │              │              │
              ▼              ▼              ▼
      ArbitrageSimulation  Opportunities  TriangularRoutes
```

---

## Directory Structure

```
src/
├── index.ts                    # Entry point: startup pipeline + main loop
├── config.ts                   # BotConfig from env vars
├── detector.ts                 # GraphDetector wrapper
├── executor.ts                 # Dry-run executor (no real txs)
├── logger.ts                   # Console + file logging
├── scheduler.ts                # EventScheduler + watchdog
├── analytics.ts                # Session metrics
├── circuit-breaker.ts          # Degraded mode detection
├── market-validator.ts         # Provider health + signal quality
├── pair-state.ts               # Monitored pair state machine
├── pool-discovery.ts           # Pool registry loader
├── rate-limiter.ts             # Token bucket + cooldown
├── state-consistency.ts        # Cache ↔ Graph consistency checks
│
├── config/
│   ├── pools.ts                # POOL_REGISTRY (19 pools), TOKEN_MINTS
│   └── programs.ts             # OFFICIAL_PROGRAMS (program IDs)
│
├── market/
│   ├── state-cache.ts          # MarketStateCache — pool/pair storage
│   ├── types.ts                # Shared interfaces
│   ├── index.ts                # Re-exports
│   ├── whirlpool-provider.ts   # Whirlpool (Orca) account parser
│   ├── raydium-provider.ts     # Raydium CLMM account parser + polling
│   ├── meteora-provider.ts     # Meteora DLMM account parser
│   ├── jupiter-provider.ts     # Jupiter API fallback quotes
│   ├── account-validator.ts    # Field-level validation per DEX
│   └── account-metrics.ts      # Parse success/failure stats
│
├── graph/
│   ├── price-graph.ts          # PriceGraph — token nodes, pool edges, market surfaces
│   └── index.ts                # Re-exports
│
├── engine/
│   ├── index.ts                # Re-exports
│   ├── types.ts                # Shared interfaces (ExecutableOpportunity, etc.)
│   ├── spread-engine.ts        # Cross-DEX simulation + scanner display
│   ├── executable-detector.ts  # Top-level opportunity detection
│   ├── market-surface-engine.ts# Cached surface reports per pair
│   ├── slippage-estimator.ts   # CLMM swap simulation per pool
│   ├── path-builder.ts         # Triangular route enumeration via DFS
│   ├── edge-quality.ts         # Per-pool quality scoring
│   ├── microstructure.ts       # Pool microstructure metrics
│   ├── spread-analytics.ts     # Statistical spread analysis
│   ├── spread-persistence.ts   # Spread lifetime tracking
│   └── network-health.ts       # Full network report
│
├── math/
│   ├── clmm.ts                 # sqrtPrice↔price, getAmountA/B, estimateSwapOutput
│   ├── tick.ts                 # tick↔sqrtPrice conversions
│   └── swap.ts                 # Constant product swap simulation
│
├── scanner/                    # Jupiter-based multi-hop scanner
│   ├── scanner.ts              # Orchestrator: direct + triangular scans
│   ├── token-discovery.ts      # Jupiter token list → pairs
│   ├── quote-engine.ts         # Jupiter quote API wrapper
│   ├── route-finder.ts         # SOL→Token→USDC→SOL triangular routes
│   └── profit-calculator.ts    # Fee estimation + profitability check
│
├── events/
│   ├── bus.ts                  # EventBus pub/sub
│   └── types.ts                # Event types
│
├── ws/
│   └── manager.ts              # WebSocketManager: onAccountChange, onSlotUpdate
│
└── utils/
    └── index.ts                # sleep, withRetry, formatNumber, etc.
```

---

## Supported DEXes

| DEX | Type | Program ID | Pool Size | Provider File |
|-----|------|-----------|-----------|---------------|
| **Orca Whirlpool** | CLMM | `whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc` | 85–660 bytes | `whirlpool-provider.ts` |
| **Raydium CLMM** | CLMM | `CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK` | 1544 bytes | `raydium-provider.ts` |
| **Meteora DLMM** | DLMM | `LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo` | 241–500 bytes | `meteora-provider.ts` |
| **Jupiter** | Aggregator | N/A (REST API) | N/A | `jupiter-provider.ts` |

---

## 19 Registered Pools (POOL_REGISTRY)

### SOL/USDC — 4 pools
| DEX | Address | Fee | Tick Spacing |
|-----|---------|-----|-------------|
| Raydium CLMM | `3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv` | 5 bps | 1 |
| Whirlpool | `Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE` | 4 bps | 64 |
| Raydium CLMM | `2QdhepnKRTLjjSqPL1PtKNwqrUkoLee5Gqs8bvZhRdMv` | 5 bps | 8 |
| Raydium CLMM | `CYbD9RaToYMtWKA7QZyoLahnHdWq553Vm62Lh6qWtuxq` | 25 bps | 8 |

### SOL/USDT — 2 pools
| DEX | Address | Fee | Tick Spacing |
|-----|---------|-----|-------------|
| Raydium CLMM | `3nMFwZXwY1s1M5s8vYAHqd4wGs4iSxXE4LRoUMMYqEgF` | 5 bps | 8 |
| Raydium CLMM | `6kT4MhDqKrkWikaGpFCvYsk45BUKXEe2gTpNGAR1YcjS` | 5 bps | 8 |

### JUP/SOL — 2 pools
| DEX | Address | Fee | Tick Spacing |
|-----|---------|-----|-------------|
| Whirlpool | `C1MgLojNLWBKADvu9BHdtgzz1oZX4dZ5zGdGcgvvW8Wz` | 4 bps | 64 |
| Raydium CLMM | `EZVkeboWeXygtq8LMyENHyXdF5wpYrtExRNH9UwB1qYw` | 5 bps | 8 |

### mSOL/SOL — 2 pools
| DEX | Address | Fee | Tick Spacing |
|-----|---------|-----|-------------|
| Meteora DLMM | `HcjZvfeSNJbNkfLD4eEcRBr96AD3w1GpmMppaeRZf7ur` | 4 bps | 1 bin |
| Raydium CLMM | `8EzbUfvcRT1Q6RL462ekGkgqbxsPmwC5FMLQZhSPMjJ3` | 5 bps | 8 |

### jitoSOL/SOL — 2 pools
| DEX | Address | Fee | Tick Spacing |
|-----|---------|-----|-------------|
| Whirlpool | `Hp53XEtt4S8SvPCXarsLSdGfZBuUr5mMmZmX2DRNXQKp` | 4 bps | 64 |
| Raydium CLMM | `2uoKbPEidR7KAMYtY4x7xdkHXWqYib5k4CutJauSL3Mc` | 5 bps | 8 |

### BONK/SOL — 2 pools
| DEX | Address | Fee | Tick Spacing |
|-----|---------|-----|-------------|
| Whirlpool | `3ne4mWqdYuNiYrYZC9TrA3FcfuFdErghH97vNPbjicr1` | 16 bps | 64 |
| Raydium CLMM | `GtKKKs3yaPdHbQd2aZS4SfWhy8zQ988BJGnKNndLxYsN` | 25 bps | 64 |

### WIF/SOL — 2 pools
| DEX | Address | Fee | Tick Spacing |
|-----|---------|-----|-------------|
| Raydium CLMM | `4mMDQ5kG9fFrBSQeedErsUoTBhY5KKnsKWGvenXRTwSy` | 100 bps | 128 |
| Whirlpool | `D6NdKrKNQPmRZCCnG1GqXtF7MMoHB7qR6GU5TkG59Qz1` | 4 bps | 4 |

### PYTH/SOL — 2 pools
| DEX | Address | Fee | Tick Spacing |
|-----|---------|-----|-------------|
| Raydium CLMM | `9n3dSLrERZQp95dHXywft7xV8D8xnGFLaUHtEhQVaXaC` | 25 bps | 64 |
| Whirlpool | `8erNF5u3CHrqZJXtkfY8CjSxFYF1yqHmN8uDbAhk6tWM` | 5 bps | 8 |

### RAY/USDC — 1 pool
| DEX | Address | Fee | Tick Spacing |
|-----|---------|-----|-------------|
| Raydium CLMM | `61R1ndXxvsWXXkWSyNkCxnzwd3zUNB8Q2ibmkiLPC8ht` | 25 bps | 8 |

### POPCAT/SOL — 1 pool
| DEX | Address | Fee | Tick Spacing |
|-----|---------|-----|-------------|
| Whirlpool | `AHTTzwf3GmVMJdxWM8v2MSxyjZj8rQR6hyAC3g9477Yj` | 25 bps | 64 |

---

## 11 Monitored Tokens

| Symbol | Mint | Decimals |
|--------|------|----------|
| SOL | `So11111111111111111111111111111111111111112` | 9 |
| USDC | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | 6 |
| USDT | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` | 6 |
| JUP | `JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN` | 6 |
| WIF | `EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm` | 6 |
| RAY | `4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R` | 6 |
| BONK | `DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263` | 5 |
| POPCAT | `7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr` | 9 |
| PYTH | `HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3` | 6 |
| mSOL | `mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So` | 9 |
| jitoSOL | `J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn` | 9 |

### Canonical Pair Ordering (priority list)

All prices are normalized to this priority: **SOL > USDC > USDT > JUP > WIF > RAY > BONK > POPCAT > PYTH > mSOL > jitoSOL**

When building a pair label (e.g. `BONK/SOL`), the higher-priority token comes first. If the on-chain mint ordering is inverted relative to the registry, the price is automatically inverted (`1/price`).

---

## Data Flow (End-to-End)

### 1. Startup Pipeline (`src/index.ts:initialize`)

```
checkRpcConnectivity() → verifyWebSocket() → attachWsToProviders()
→ startProviders() → subscribePools() → verifyMarketCache()
→ start SpreadEngine + eventScheduler watchdog → mainLoop()
```

### 2. Subscription (WS + Provider)

**Whirlpool** pools receive WS updates via two paths:
- **Provider `trackPool`**: fetches initial account data, verifies owner, parses layout
- **Direct WS subscription** in `subscribePools()`: raw `onAccountChange` callback parses bytes at known offsets

**Raydium** pools: `trackPool` fetches initial data + subscribes via central WS. A **poll timer** (every 15s) re-fetches stale pools (>25s without update) since Raydium CLMM pools on public RPC often stop sending WS updates.

**Meteora** pools: `trackPool` fetches initial data, subscribes via central WS. Uses a simplified layout (no sqrtPrice/liquidity — computes price from `binStep + activeId`).

### 3. Account Parsing

#### Whirlpool Layout (85+ bytes, verified against Orca source)
| Offset | Size | Field |
|--------|------|-------|
| 0 | 8 | discriminator |
| 41 | 2 | tickSpacing (u16) |
| 45 | 2 | fee (u16) |
| 47 | 2 | protocolFee (u16) |
| 49 | 16 | liquidity (u128) |
| 65 | 16 | sqrtPrice (u128) |
| 81 | 4 | tick (i32) |
| 101 | 32 | tokenMintA |
| 133 | 32 | tokenVaultA |
| 181 | 32 | tokenMintB |
| 213 | 32 | tokenVaultB |

#### Raydium CLMM Layout (1544 bytes)
| Offset | Size | Field |
|--------|------|-------|
| 0 | 8 | discriminator |
| 73 | 32 | mintA |
| 105 | 32 | mintB |
| 137 | 32 | tokenVaultA |
| 169 | 32 | tokenVaultB |
| 201 | 32 | observationKey |
| 233 | 1 | decimalsA (u8) |
| 234 | 1 | decimalsB (u8) |
| 235 | 2 | tickSpacing (u16) |
| 237 | 16 | liquidity (u128) |
| 253 | 16 | sqrtPriceX64 (u128) |
| 269 | 4 | tickCurrent (i32) |

#### Meteora DLMM Layout (241+ bytes)
| Offset | Size | Field |
|--------|------|-------|
| 0 | 8 | discriminator |
| 40 | 32 | tokenMintX |
| 72 | 32 | tokenMintY |
| 104 | 32 | reserveX |
| 136 | 32 | reserveY |
| 168 | 32 | tokenXVault |
| 200 | 32 | tokenYVault |
| 232 | 2 | binStep (u16) |
| 234 | 4 | activeId (i32) |
| 238 | 2 | baseFeeBps (u16) |

Meteora price formula: `price = (1 + binStep/10000) ^ activeId × 10^(decimalsA - decimalsB)`

### 4. Validation Pipeline (`account-validator.ts`)

Each incoming update passes through:
1. **Account size check** — per-DEX min/max
2. **Owner verification** — `getAccountInfo` owner must match program ID
3. **Tick range** — [-500000, 500000]
4. **SqrtPrice** — > 0, finite, ≈[1e-8, 1e10]
5. **Liquidity** — > 0, finite, ≤ 1e18
6. **Price validation** (`state-cache.ts:isValidPoolData`) — calculated spot price ≤ 1e15

If `dataQuality === "VALID"` (set by provider after successful parse), price validation in `isValidPoolData` returns `true` immediately.

### 5. MarketStateCache (`state-cache.ts`)

Stores `PoolStateSnapshot` and `PairState` objects. Features:
- **Dedup by slot**: ignores updates with slot < current slot (reorg protection)
- **Dedup by value**: ignores identical sqrtPrice+liquidity within 2s
- **Age filter**: pools older than 120s are evicted on access
- **Mint order tracking**: records on-chain mint ordering vs registry to detect inversion
- **Price normalization**: `calculateSpotPrice` inverts price if on-chain mints are reversed relative to canonical priority

### 6. PriceGraph (`price-graph.ts`)

- **Nodes**: tokens (mint → symbol map)
- **Edges**: directed pool edges in both directions (A→B and B→A)
- **Health states**: `VALID`, `STALE`, `LOW_LIQUIDITY`, `INVALID`, `CORRUPTED`
- **Price bounds for VALID**: [1e-12, 1e12], tick [-500000, 500000]
- **Cross-validation**: an edge whose price deviates >10% from the median of sibling pools for the same pair is downgraded to `LOW_LIQUIDITY`

`seedFromRegistry` creates edges with health `INVALID` and price 0 — they become `VALID` when first on-chain update arrives via `updateFromPool`.

`getMarketSurface(label)` returns all pools for a pair with prices normalized to canonical direction (priority-based). The surface shows `bestBid` (highest price to sell) and `bestAsk` (lowest price to buy).

### 7. SpreadEngine (`spread-engine.ts`)

Event-driven (subscribes to `pool:update`). On each event:
1. Fetches all pair surfaces from PriceGraph
2. For each USDC/USDT-quoted pair: filters pools by `age < 30s`, sorts by price
3. Simulates arbitrage at 5 sizes: $10, $100, $500, $1k, $5k
4. Simulation: `solOut = usdcIn / buyPrice` → `usdcOut = solIn × sellPrice`, deducting fees + slippage
5. Rejects: BUY_ZERO_OUTPUT, SELL_ZERO_OUTPUT, NEGATIVE_AFTER_FEES, SLIPPAGE_100PCT, ABSURD_PROFIT, OUTPUT_2X_INPUT

Slippage estimation: `slippageBps = min(5000, ratio × 10000 × 5)` where `ratio = tradeUsd / poolLiquidityUsd`.

### 8. SlippageEstimator (`slippage-estimator.ts`)

Uses `estimateSwapOutput` from `math/clmm.ts` for realistic CLMM swap simulation:
- **Buy**: given USDC input, compute SOL output via `estimateSwapOutput(liquidity, sqrtPriceX64, usdcIn, fee, zeroForOne=false)`
- **Sell**: given SOL input, compute USDC output via `estimateSwapOutput(liquidity, sqrtPriceX64, solIn, fee, zeroForOne=true)`
- Tests 7 trade sizes [0.01, 0.03, 0.05, 0.1, 0.25, 0.5, 1.0 SOL] and picks optimal
- Also checks for tick crossing (price moving beyond tick spacing)

### 9. ExecutableDetector (`executable-detector.ts`)

Top-level detection that runs on each scan:
1. Direct cross-DEX: iterates pair surfaces, finds buy/sell pool pairs with `executableSpreadBps > 0.3`
2. Filters by: pool age < 8s, slot lag ≤ 15
3. Runs `slippageEstimator.findOptimalTrade` for each pair
4. Computes confidence score from profit, freshness, liquidity, quality
5. Every 3rd scan: triangular route enumeration via `PathBuilder`
6. Ranks opportunities by multi-factor score

### 10. PathBuilder (`path-builder.ts`)

DFS-based triangular path enumeration:
- Starts from SOL, explores all VALID edges up to 3 hops
- Detects cycles returning to SOL
- For each cycle: computes gross spread, deducts fees (per-hop + 2 bps slippage), estimates profit
- Filters: net spread ≥ 0.5 bps, pool age < 10s
- Tests these symbols: SOL, USDC, USDT, JUP, mSOL, jitoSOL, BONK, RAY

### 11. Jupiter Scanner (`scanner/`)

Alternative detection path via Jupiter API:
- `tokenDiscovery`: fetches Jupiter strict token list, generates pairs with USDC/USDT/SOL as quote
- `quoteEngine`: wraps Jupiter quote API with rate limiting, retries, endpoint fallback (lite-api → api)
- `routeFinder`: discovers direct routes (token→quote) and triangular routes (SOL→token→USDC→SOL)
- `profitCalculator`: estimates all costs (swap fees, priority fees, slippage, MEV tip, network fee)
- Runs every 3rd main loop iteration, results are cross-checked against graph

### 12. Math (`math/clmm.ts`)

Core CLMM swap math using BigInt:
- `sqrtPriceX64ToPrice`: `(sqrtPrice / 2^64)² × 10^(decimalsA - decimalsB)`
- `estimateSwapOutput`: given liquidity, sqrtPrice, inputAmount, fee, direction:
  - **zeroForOne=true** (sell token A for B): `sqrtPriceAfter = (liq × sqrt) / (liq + amountIn × sqrt)`; `output = liq × (sqrt - sqrtAfter) / (sqrt × sqrtAfter)`
  - **zeroForOne=false** (buy token A with B): `sqrtPriceAfter = sqrt + (amountIn × 2^64) / liq`; `output = liq × (sqrtAfter - sqrt) / sqrtAfter`
  - All divisions protected against zero
- `getAmountAFromLiquidity`: computes token A amount for a given price range (with zero guards)

---

## Startup Verification Checks

On startup, the system runs:
1. RPC connectivity (getSlot, getVersion)
2. WebSocket connection (onSlotUpdate)
3. Provider attachment to WS Manager
4. Provider start (program ID validation)
5. Pool subscription via provider.trackPool + direct WS subscriptions
6. Market data cache wait (12s timeout for first pool update)
7. State consistency check (cache ↔ graph)
8. Graph summary + network report
9. Signal quality assessment

---

## Key Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PRIVATE_KEY` | required | Wallet private key (base58) |
| `RPC_URL` | required | Solana RPC endpoint |
| `DRY_RUN` | `true` | Simulation mode (NO real txs) |
| `MIN_PROFIT_USD` | `0.05` | Minimum profit threshold |
| `MAX_TRADE_SOL` | `0.1` | Maximum trade size |
| `SLIPPAGE_BPS` | `50` | Default slippage tolerance |
| `CHECK_INTERVAL_MS` | `3000` | Main loop interval |
| `MAX_REQUESTS_PER_MIN` | `60` | Rate limit for external APIs |
| `DEBUG_MODE` | `false` | Enable hex dump logging |
| `SCAN_MAX_PAIRS` | `50` | Scanner max pairs per scan |
| `SCAN_MIN_LIQUIDITY_USD` | `500000` | Scanner min liquidity |
| `SCAN_QUOTE_SIZE_SOL` | `0.05` | Scanner quote size |

---

## Detector States (what the system logs)

### Account Integrity Log
```
══════════ ACCOUNT INTEGRITY ══════════
Raydium CLMM: valid=50 corrupt=0 fail=0 rate=0.0% valid/s=0.83
  last reject: none (slot 0)
Whirlpool: valid=265 corrupt=5 fail=0 rate=1.9% valid/s=4.42
  last reject: SQRT_PRICE_OUT_OF_RANGE (slot 0)
  rejected: size=0 owner=0 disc=0 tick=0 sqrt=5 liq=0 price=0
```

### Network Report
```
══════════ MARKET NETWORK ══════════
Nodes: 11 [BONK, JUP, PYTH, RAY, SOL, USDC, USDT, WIF, jitoSOL, mSOL, POPCAT]
Edges: 40 (32 válidos, 8 obsoletos)
Pairs: 10 [BONK/SOL, JUP/SOL, PYTH/SOL, RAY/USDC, SOL/USDC, SOL/USDT, SOL/jitoSOL, SOL/mSOL, WIF/SOL, POPCAT/SOL]
Pools: 19
DEXes: Meteora DLMM, Raydium CLMM, Whirlpool
```

### Spread Engine Scan Output
```
═══════════════════════════════════════════════════════════════════════════════════
🔍 INEFFICIENCY SCAN #27  |  10 pair(s)  |  0 simulation(s)  |  0 executable
═══════════════════════════════════════════════════════════════════════════════════

  ┌─ BONK/SOL ───────────────────────────────────────────────────
  │  BUY  → Whirlpool @ 0.000070
  │  SELL → Raydium CLMM @ 0.000070
  │
  │  💰 PRICE GAP: +0.000000 USDC  →  +0.09 bps GROSS SPREAD
  │
  │  Pools (2 total, 2 VALID):
  │    Whirlpool @ 0.000070  |  liq: 14212606  |  fee: 16 bps  |  age: 1.0s  |  VALID
  │    Raydium CLMM @ 0.000070  |  liq: 14212557  |  fee: 25 bps  |  age: 1.0s  |  VALID
```

### Live Spreads
```
══════════════ LIVE SPREADS ══════════════
SOL/USDC:
  BUY:  Whirlpool @ 160.56
  SELL: Raydium CLMM @ 160.59
  Spread: +2.72 bps  Gross: +$0.0003  Fees: -4.50 bps  Net: +0.00 bps  Executable: NO
```

---

## Graph Edges (40 total, 32 VALID)

When running with `DEBUG_MODE=true`, each edge update logs:
```
Graph: SOL/USDC → Whirlpool price=$160.56 liq=6.2M tick=30 slot=1234567 health=VALID (8 edges total)
Graph: SOL/USDC → Raydium CLMM price=$160.59 liq=8.1M tick=0 slot=0 health=VALID (8 edges total)
```

---

## Rate Limiter

Token bucket rate limiter (`rate-limiter.ts`):
- 6 tokens, refill based on configurable RPM (default 60 req/min)
- Exponential cooldown on 429: 15s → 30s → 60s → 120s
- Request queue with gradual drain
- Cache TTL: 2s for API responses
- Jitter factor: 25% on cooldown durations

---

## Circuit Breaker

`circuit-breaker.ts` detects degraded modes:
- 5+ consecutive failures → degraded
- 3+ rate limit spikes → degraded
- Queue depth > 20 → degraded
- Decay every 30s (gradual recovery)
- Degraded mode: 5x max check interval, 2x reduced concurrency

---

## WebSocket Manager

`ws/manager.ts` wraps `Connection.onSlotUpdate` and `Connection.onAccountChange`:
- Tracks slot updates for latency/reconnect metrics
- Auto-reconnect with exponential backoff (1s → 2s → 4s → ... → 30s)
- Resubscribes all accounts on reconnect
- Health check every 15s (slot lag > 30s triggers reconnect)
- Reports: updates/sec, account-updates/sec, slot lag, subscription count

---

## Known Issues & Limitations

1. **Meteora DLMM**: Provider connects but pools have high fee rates. Layout parsing works but uses synthetic liquidity (hardcoded `10_000_000_000_000n`) since Meteora stores liquidity across bins rather than a single u128.

2. **All simulations negative**: Gross spreads in USD pairs (3–5 bps) are consumed by combined fees (10–39 bps). No executable opportunities detected yet.

3. **RAY/USDC**: Only 1 pool (Raydium CLMM). No Whirlpool pool with correct mints or positive TVL found.

4. **POPCAT/SOL**: Only 1 pool (Whirlpool). No Raydium CLMM pool exists; Raydium AMM v4 pool exists but would need a new provider.

5. **Stale data**: Low-volume pools (WIF/SOL, PYTH/SOL) require polling every 15s in Raydium provider. Whirlpool pools on public RPC may also go stale.

6. **Public RPC limitations**: WebSocket `onAccountChange` does not reliably fire for all subscriptions on public endpoints. Helius/QuickNode recommended.

7. **BONK/SOL pools**: Prices match at ~14,212,557 but Whirlpool fee is 30% (3000 bps?) — fee is 16 bps in config but may not be accurate.

---

## How to Run

```bash
# Install dependencies
npm install

# Configure
cp .env.example .env
# Edit .env with your PRIVATE_KEY and RPC_URL

# Run
npm run dev

# Build
npm run build && npm start
```

### Required .env variables
```
PRIVATE_KEY=<base58-encoded-private-key>
RPC_URL=https://api.mainnet-beta.solana.com
```

### Optional .env variables
```
DRY_RUN=true
MIN_PROFIT_USD=0.05
MAX_TRADE_SOL=0.1
SLIPPAGE_BPS=50
CHECK_INTERVAL_MS=3000
DEBUG_MODE=false
SCAN_MAX_PAIRS=50
SCAN_MIN_LIQUIDITY_USD=500000
SCAN_QUOTE_SIZE_SOL=0.05
```
