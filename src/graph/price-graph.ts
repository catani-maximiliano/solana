import { sqrtPriceX64ToPrice } from "../math";
import { marketState, PoolStateSnapshot } from "../market/state-cache";
import { POOL_REGISTRY } from "../config/pools";
import { logDebug, logSuccess, logWarning, logInfo } from "../logger";

export type EdgeHealth = "VALID" | "STALE" | "INVALID" | "LOW_LIQUIDITY" | "INVALID_PRICE" | "INVALID_DECIMALS" | "INVALID_ORIENTATION" | "INVALID_FEE" | "INVALID_SLOT" | "CORRUPTED";

export interface PriceNode {
  token: string;
  symbol: string;
  totalLiquidity: number;
  poolCount: number;
}

export interface PriceEdge {
  from: string;
  to: string;
  dex: string;
  poolAddress: string;
  price: number;
  inversePrice: number;
  liquidity: number;
  fee: number;
  weight: number;
  slot: number;
  timestamp: number;
  health: EdgeHealth;
  source: "seed" | "ws_direct" | "provider" | "fallback";
}

export interface MarketSurfaceEntry {
  poolAddress: string;
  dex: string;
  price: number;
  liquidity: number;
  fee: number;
  health: EdgeHealth;
  age: number;
  slot: number;
  decimalsA: number;
  decimalsB: number;
  sqrtPriceX64: string;
}

export interface MarketSurface {
  pair: string;
  symbolA: string;
  symbolB: string;
  pools: MarketSurfaceEntry[];
  validCount: number;
  totalCount: number;
  bestBid: number;
  bestAsk: number;
  spreadRange: number;
  /** Liquidity-weighted consensus price across VALID pools */
  consensusPrice: number;
  /** Unique DEX count for diversity weighting */
  dexDiversity: number;
}

// ── Token-pair-aware price sanity bounds ──
// Keyed by canonical pair label "A/B" where price = units of B per 1 unit of A.
const PRICE_BOUNDS: Record<string, { min: number; max: number; humanDesc: string }> = {
  "SOL/USDC":    { min: 1,             max: 1000,           humanDesc: "USDC per SOL" },
  "SOL/USDT":    { min: 1,             max: 1000,           humanDesc: "USDT per SOL" },
  "SOL/JUP":     { min: 100,           max: 100_000,        humanDesc: "JUP per SOL" },
  "SOL/WIF":     { min: 5,             max: 5_000,          humanDesc: "WIF per SOL" },
  "SOL/BONK":    { min: 100_000,       max: 1_000_000_000,  humanDesc: "BONK per SOL" },
  "SOL/PYTH":    { min: 50,            max: 100_000,        humanDesc: "PYTH per SOL" },
  "SOL/POPCAT":  { min: 1,             max: 10_000,         humanDesc: "POPCAT per SOL" },
  "SOL/mSOL":    { min: 0.5,           max: 2.0,            humanDesc: "mSOL per SOL" },
  "SOL/jitoSOL": { min: 0.5,           max: 2.0,            humanDesc: "jitoSOL per SOL" },
  "USDC/JUP":    { min: 0.1,           max: 100,            humanDesc: "JUP per USDC" },
  "USDC/RAY":    { min: 0.01,          max: 100,            humanDesc: "RAY per USDC" },
  "USDC/BONK":   { min: 1_000,         max: 10_000_000,     humanDesc: "BONK per USDC" },
  "USDC/WIF":    { min: 0.1,           max: 10,             humanDesc: "WIF per USDC" },
  "USDC/PYTH":   { min: 0.1,           max: 500,            humanDesc: "PYTH per USDC" },
  "USDC/POPCAT": { min: 0.1,           max: 100,            humanDesc: "POPCAT per USDC" },
};

// ── Token decimal registry (known good decimals per token symbol) ──
const TOKEN_DECIMALS: Record<string, number> = {
  SOL: 9, USDC: 6, USDT: 6, JUP: 6, WIF: 6,
  RAY: 6, BONK: 5, POPCAT: 9, PYTH: 6,
  mSOL: 9, jitoSOL: 9,
};

function validateTokenDecimals(symA: string, symB: string, decimalsA: number, decimalsB: number): { valid: boolean; reason: string } {
  const expectedA = TOKEN_DECIMALS[symA];
  const expectedB = TOKEN_DECIMALS[symB];
  if (expectedA === undefined && expectedB === undefined) return { valid: true, reason: "" };
  if (expectedA !== undefined && decimalsA !== expectedA) {
    return { valid: false, reason: `${symA} decimals mismatch: got ${decimalsA}, expected ${expectedA}` };
  }
  if (expectedB !== undefined && decimalsB !== expectedB) {
    return { valid: false, reason: `${symB} decimals mismatch: got ${decimalsB}, expected ${expectedB}` };
  }
  if (decimalsA < 0 || decimalsA > 18 || decimalsB < 0 || decimalsB > 18) {
    return { valid: false, reason: `decimals out of range: A=${decimalsA}, B=${decimalsB}` };
  }
  return { valid: true, reason: "" };
}

// ── Token USD price bounds for derived price validation ──
const TOKEN_USD_BOUNDS: Record<string, { min: number; max: number }> = {
  SOL:    { min: 10,  max: 1000 },
  USDC:   { min: 0.9, max: 1.1 },
  USDT:   { min: 0.9, max: 1.1 },
  JUP:    { min: 0.1, max: 50 },
  WIF:    { min: 0.05, max: 10 },
  RAY:    { min: 0.1, max: 50 },
  BONK:   { min: 1e-7, max: 0.01 },
  POPCAT: { min: 0.01, max: 10 },
  PYTH:   { min: 0.01, max: 10 },
  mSOL:   { min: 10,  max: 1000 },
  jitoSOL: { min: 10, max: 1000 },
};

// ── Inverse edge validation ──
function validateInverseEdge(price: number, inversePrice: number, tolerance: number = 1e-9): { valid: boolean; actualInverse: number; deviation: number } {
  const expected = price > 0 ? 1 / price : 0;
  const deviation = expected > 0 ? Math.abs(inversePrice - expected) / expected : Math.abs(inversePrice - expected);
  return {
    valid: deviation <= tolerance,
    actualInverse: inversePrice,
    deviation,
  };
}

// Priority order for canonical pair labeling (lower index = higher priority)
const CANONICAL_PRIORITY = ["SOL", "USDC", "USDT", "JUP", "WIF", "RAY", "BONK", "POPCAT", "PYTH", "mSOL", "jitoSOL"];

function getCanonicalPair(symA: string, symB: string): string {
  const ai = CANONICAL_PRIORITY.indexOf(symA);
  const bi = CANONICAL_PRIORITY.indexOf(symB);
  return ai !== -1 && bi !== -1 && ai <= bi ? `${symA}/${symB}` : `${symB}/${symA}`;
}

function checkPriceBounds(symFrom: string, symTo: string, price: number): { valid: boolean; canonicalPair: string; normalizedPrice: number; bounds: { min: number; max: number; humanDesc: string } } {
  const canonicalPair = getCanonicalPair(symFrom, symTo);
  const bounds = PRICE_BOUNDS[canonicalPair];
  if (!bounds) return { valid: true, canonicalPair, normalizedPrice: price, bounds: { min: 0, max: Infinity, humanDesc: "unknown" } };

  // If from symbol is not the first symbol in the canonical label, invert the price
  const [first] = canonicalPair.split("/");
  const normalizedPrice = symFrom === first ? price : (price > 0 ? 1 / price : 0);

  return {
    valid: normalizedPrice >= bounds.min && normalizedPrice <= bounds.max,
    canonicalPair,
    normalizedPrice,
    bounds,
  };
}

// ── Comprehensive edge semantic validation ──
// Runs ALL checks (price bounds, decimals, orientation, inverse, hard sanity)
// and returns the first failure reason, or "VALID" if all pass.
const HARD_FEE_CAP_BPS = 500; // absolute sanity: any fee > 500bps is invalid data
const ROUTING_MAX_FEE_BPS = 25; // exclude high-fee pools from routing
const ROUTING_MIN_LIQUIDITY = 50_000; // exclude low-liquidity pools from routing

function validateEdgeSemantics(
  symFrom: string, symTo: string,
  price: number, inversePrice: number,
  decimalsA: number, decimalsB: number,
  liquidity: number, tick: number, fee: number,
): { health: EdgeHealth; canonicalPair: string; normalizedPrice: number; detail: string } {
  const canonicalPair = getCanonicalPair(symFrom, symTo);
  const [first] = canonicalPair.split("/");

  // 1. Hard sanity checks
  if (typeof price !== "number" || !isFinite(price)) return { health: "CORRUPTED", canonicalPair, normalizedPrice: 0, detail: `price is NaN/Infinity: ${price}` };
  if (price <= 0) return { health: "CORRUPTED", canonicalPair, normalizedPrice: 0, detail: `price <= 0: ${price}` };
  if (typeof inversePrice !== "number" || !isFinite(inversePrice)) return { health: "CORRUPTED", canonicalPair, normalizedPrice: 0, detail: `inversePrice is NaN/Infinity: ${inversePrice}` };
  if (tick < -500000 || tick > 500000) return { health: "CORRUPTED", canonicalPair, normalizedPrice: 0, detail: `tick out of range: ${tick}` };
  if (typeof liquidity !== "number" || !isFinite(liquidity) || liquidity < 0) return { health: "CORRUPTED", canonicalPair, normalizedPrice: 0, detail: `liquidity invalid: ${liquidity}` };
  if (typeof fee !== "number" || !isFinite(fee) || fee < 0 || fee > HARD_FEE_CAP_BPS) return { health: "INVALID_FEE", canonicalPair, normalizedPrice: 0, detail: `fee ${fee} bps exceeds HARD_FEE_CAP_BPS=${HARD_FEE_CAP_BPS}` };

  // Normalize price to canonical orientation (B per A in "A/B")
  const normalizedPrice = symFrom === first ? price : (price > 0 ? 1 / price : 0);

  // 2. Token decimal validation (symFrom/symTo are already symbols)
  const decResult = validateTokenDecimals(symFrom, symTo, decimalsA, decimalsB);
  if (!decResult.valid) {
    return { health: "INVALID_DECIMALS", canonicalPair, normalizedPrice, detail: decResult.reason };
  }

  // 3. Canonical orientation check
  const canonicalForward = symFrom === first;
  if (!canonicalForward) {
    // This edge is in reverse direction (e.g., B→A when canonical is A/B).
    // If the canonical orientation is A/B, and we have B→A, it's the "backward" direction.
    // This is fine as long as the inverse edge exists. We mark it as VALID but note the orientation.
  }

  // 4. Inverse edge consistency
  const invCheck = validateInverseEdge(price, inversePrice);
  if (!invCheck.valid) {
    return { health: "INVALID_ORIENTATION", canonicalPair, normalizedPrice, detail: `inversePrice=${inversePrice} != 1/${price}=${invCheck.actualInverse.toExponential(4)}, deviation=${invCheck.deviation.toExponential(2)}` };
  }

  // 5. Price bounds check
  const bounds = PRICE_BOUNDS[canonicalPair];
  if (bounds) {
    if (normalizedPrice < bounds.min || normalizedPrice > bounds.max) {
      return { health: "INVALID_PRICE", canonicalPair, normalizedPrice, detail: `${canonicalPair} (${bounds.humanDesc}): ${normalizedPrice.toExponential(4)} outside [${bounds.min.toExponential(2)}, ${bounds.max.toExponential(2)}]` };
    }
  }

  // 6. Low liquidity check
  if (liquidity === 0 || liquidity < 1_000) {
    return { health: "LOW_LIQUIDITY", canonicalPair, normalizedPrice, detail: `low liquidity: ${liquidity}` };
  }

  return { health: "VALID", canonicalPair, normalizedPrice, detail: "" };
}

function validatePoolPrice(price: number, liquidity: number, tick: number): EdgeHealth {
  if (!isFinite(price) || price <= 0) return "CORRUPTED";
  if (price < 1e-12 || price > 1e12) return "CORRUPTED";
  if (tick < -500000 || tick > 500000) return "CORRUPTED";
  if (!isFinite(liquidity) || liquidity < 0) return "CORRUPTED";
  if (liquidity === 0) return "LOW_LIQUIDITY";
  if (liquidity < 1_000) return "LOW_LIQUIDITY";
  return "VALID";
}

// ── Reference price engine: derive expected token prices via SOL/USDC anchor ──
function deriveTokenUsd(solUsd: number, edgePrice: number, symFrom: string, symTo: string): number | null {
  // For SOL/X: X price = solUsd / (X per SOL = edgePrice)
  if (symFrom === "SOL" && symTo !== "SOL" && edgePrice > 0) return solUsd / edgePrice;
  // For X/SOL: X price = solUsd * edgePrice (edgePrice = SOL per X)
  if (symTo === "SOL" && symFrom !== "SOL" && edgePrice > 0) return solUsd * edgePrice;
  // For USDC/X: X price = 1 / edgePrice
  if (symFrom === "USDC" && symTo !== "USDC" && edgePrice > 0) return 1 / edgePrice;
  // For X/USDC: X price = edgePrice
  if (symTo === "USDC" && symFrom !== "USDC" && edgePrice > 0) return edgePrice;
  return null;
}

function checkDerivedPrice(price: number, solUsd: number, symFrom: string, symTo: string): { valid: boolean; derivedUsd: number | null; reason: string } {
  const derivedUsd = deriveTokenUsd(solUsd, price, symFrom, symTo);
  if (derivedUsd === null) return { valid: true, derivedUsd: null, reason: "" };

  // Determine which non-anchor token the derivedUsd represents:
  //   SOL→X  → derivedUsd = solUsd / price (X per SOL) → X price = USD per X
  //   X→SOL  → derivedUsd = solUsd * price (SOL per X) → X price = USD per X
  //   USDC→X → derivedUsd = 1 / price (X per USDC)    → X price = USD per X
  //   X→USDC → derivedUsd = price (USDC per X)         → X price = USD per X
  const target = symFrom === "SOL" || symFrom === "USDC" ? symTo : symFrom;

  // Skip anchor tokens — their price is the reference itself
  if (target === "SOL" || target === "USDC") return { valid: true, derivedUsd, reason: "" };

  const bounds = TOKEN_USD_BOUNDS[target];
  if (!bounds) return { valid: true, derivedUsd, reason: "" };

  if (derivedUsd < bounds.min || derivedUsd > bounds.max) {
    return {
      valid: false,
      derivedUsd,
      reason: `implied ${target}=$${derivedUsd.toFixed(4)} outside [$${bounds.min}, $${bounds.max}]`,
    };
  }
  return { valid: true, derivedUsd, reason: "" };
}

const VALID_EDGE_CACHE_TTL = 30_000;
const INVERSE_TOLERANCE = 1e-6; // strict: forward * inverse must be within 0.0001%

export class PriceGraph {
  private nodes = new Map<string, PriceNode>();
  private edges = new Map<string, PriceEdge[]>();



  /** Cross-validate an edge price using:
   *  1. Reference price via SOL/USDC anchor (derived USD check)
   *  2. Liquidity-weighted consensus from sibling pools
   *  3. Cross-DEX weighted comparison
   *
   *  Returns downgraded health if price is anomalous. */
  private crossValidateEdgeHealth(edge: PriceEdge): EdgeHealth {
    if (edge.health !== "VALID") return edge.health;

    const symFrom = this.mintToSymbol(edge.from);
    const symTo = this.mintToSymbol(edge.to);
    const key = `${edge.from}:${edge.to}`;
    const siblings = this.edges.get(key);

    // ── 1. Reference price via SOL/USDC anchor ──
    const solUsdcEdge = this.getDirectPrice(this.symbolToMint("SOL"), this.symbolToMint("USDC"));
    const usdcSolEdge = this.getDirectPrice(this.symbolToMint("USDC"), this.symbolToMint("SOL"));
    const solUsd = solUsdcEdge?.price || (usdcSolEdge ? 1 / usdcSolEdge.price : 0);

    if (solUsd > 0) {
      const derived = checkDerivedPrice(edge.price, solUsd, symFrom, symTo);
      if (!derived.valid) {
        logWarning(`Graph: ⚡ derived price anomaly — ${symFrom}/${symTo} (${edge.dex} ${edge.poolAddress.substring(0, 8)}...) price=$${edge.price.toFixed(6)} ${derived.reason} — degrading to LOW_LIQUIDITY`);
        return "LOW_LIQUIDITY";
      }
    }

    // ── 2. LST sanity check ──
    // jitoSOL and mSOL should trade within 0.5-2.0 SOL equivalent
    if ((symFrom === "mSOL" || symFrom === "jitoSOL") && symTo === "SOL") {
      if (edge.price < 0.5 || edge.price > 2.0) {
        logWarning(`Graph: ⚡ LST anomaly — ${symFrom}/${symTo} (${edge.dex} ${edge.poolAddress.substring(0, 8)}...) price=$${edge.price.toFixed(4)} outside LST range [0.5, 2.0]`);
        return "INVALID_PRICE";
      }
    }
    if (symFrom === "SOL" && (symTo === "mSOL" || symTo === "jitoSOL")) {
      if (edge.price < 0.5 || edge.price > 2.0) {
        logWarning(`Graph: ⚡ LST anomaly — ${symFrom}/${symTo} (${edge.dex} ${edge.poolAddress.substring(0, 8)}...) price=$${edge.price.toFixed(4)} outside LST range [0.5, 2.0]`);
        return "INVALID_PRICE";
      }
    }

    // ── 3. Cross-pair implied USD consistency check ──
    // Compare the USD price of the "interesting" (non-anchor) token derived via the SOL route
    // vs the USDC route (e.g., JUP price via SOL/JUP vs USDC/JUP). They must agree within 5x.
    if (solUsd > 0) {
      const derivedFromSol = deriveTokenUsd(solUsd, edge.price, symFrom, symTo);
      if (derivedFromSol !== null) {
        // Determine the interesting token (the one that is NOT SOL or USDC)
        let interestingMint: string;
        if (symFrom !== "SOL" && symFrom !== "USDC") interestingMint = edge.from;
        else interestingMint = edge.to;
        const interestingSym = this.mintToSymbol(interestingMint);
        const isAnchor = interestingSym === "SOL" || interestingSym === "USDC";

        // Try to derive USD via USDC route for the same interesting token
        let usdcEdge = this.getDirectPrice(this.symbolToMint("USDC"), interestingMint);
        let derivedFromUsdc: number | null = null;
        if (usdcEdge && usdcEdge.price > 0 && usdcEdge.health === "VALID") {
          derivedFromUsdc = 1 / usdcEdge.price; // USDC→X: price = X-per-USDC, USD-per-X = 1/price
        } else {
          usdcEdge = this.getDirectPrice(interestingMint, this.symbolToMint("USDC"));
          if (usdcEdge && usdcEdge.price > 0 && usdcEdge.health === "VALID") {
            derivedFromUsdc = usdcEdge.price; // X→USDC: price = USDC-per-X
          }
        }

        if (!isAnchor && derivedFromUsdc !== null && derivedFromUsdc > 0) {
          const ratio = derivedFromSol / derivedFromUsdc;
          if (ratio > 1.5 || ratio < 0.667) {
            logWarning(`Graph: ⚡ cross-pair USD inconsistency — ${interestingSym} SOL-route=$${derivedFromSol.toFixed(4)} USDC-route=$${derivedFromUsdc.toFixed(4)} ratio=${ratio.toFixed(2)} — degrading to INVALID_PRICE`);
            return "INVALID_PRICE";
          }
        }
      }
    }

    // ── 3. Hard anomaly rejection for extreme price deviations (>100% from sibling avg)
    if (siblings && siblings.length >= 2) {
      const validSibs = siblings.filter((e) => e.poolAddress !== edge.poolAddress && e.health === "VALID" && e.price > 0);
      if (validSibs.length >= 1) {
        const sibAvg = validSibs.reduce((s, e) => s + e.price, 0) / validSibs.length;
        const dev = sibAvg > 0 ? Math.abs(edge.price - sibAvg) / sibAvg : 0;
        if (dev > 1.0) {
          logWarning(`Graph: 🔴 HARD ANOMALY — ${symFrom}/${symTo} (${edge.dex} ${edge.poolAddress.substring(0, 8)}...) price=$${edge.price.toFixed(4)} deviates ${(dev * 100).toFixed(1)}% from sib-avg=$${sibAvg.toFixed(4)} — marking INVALID_PRICE`);
          return "INVALID_PRICE";
        }
      }
    }

    // ── 4. Liquidity-weighted consensus from siblings ──
    if (!siblings || siblings.length < 2) return edge.health;

    const validSiblings = siblings
      .filter((e) => e.poolAddress !== edge.poolAddress && e.health === "VALID" && e.price > 0);

    if (validSiblings.length === 0) return edge.health;

    const totalLiq = validSiblings.reduce((s, e) => s + e.liquidity, 0);
    if (totalLiq <= 0) return edge.health;

    // Liquidity-weighted average price
    const lwAvg = validSiblings.reduce((s, e) => s + e.price * (e.liquidity / totalLiq), 0);
    const lwDeviation = lwAvg > 0 ? Math.abs(edge.price - lwAvg) / lwAvg : 0;

    // Cross-DEX check: if all siblings are from different DEXes, weight their consensus higher
    const uniqueDexes = new Set(validSiblings.map((e) => e.dex));
    const dexDiversityWeight = uniqueDexes.size / validSiblings.length;

    const threshold = 0.10 * (1 + dexDiversityWeight); // 10-20% depending on DEX diversity
    if (lwDeviation > threshold) {
      logWarning(`Graph: ⚡ liquidity-weighted anomaly — ${symFrom}/${symTo} (${edge.dex} ${edge.poolAddress.substring(0, 8)}...) price=$${edge.price.toFixed(6)} deviates ${(lwDeviation * 100).toFixed(1)}% from lw-avg=$${lwAvg.toFixed(6)} (dexDiversity=${uniqueDexes.size}, threshold=${(threshold * 100).toFixed(0)}%) — degrading to LOW_LIQUIDITY`);
      return "LOW_LIQUIDITY";
    }

    // ── 5. Triangular consistency check ──
    // Validate (A/B) * (B/C) ≈ (A/C) for any intermediate token C
    // This catches inverted prices, wrong decimals, and orientation bugs
    if (siblings && siblings.length >= 1) {
      const triCheck = this.checkTriangularConsistency(edge, symFrom, symTo);
      if (triCheck !== null) {
        if (triCheck.consistent) {
          logDebug(`TRIANGULAR CHECK: ${symFrom}/${symTo}=${edge.price.toFixed(4)} = ${triCheck.viaPrice.toFixed(4)} × ${(triCheck.derived / triCheck.viaPrice).toFixed(4)} = ${triCheck.derived.toFixed(4)} (via ${triCheck.via}) dev=${(triCheck.deviation * 100).toFixed(3)}% ${triCheck.sameDex ? "[same-dex]" : "[cross-dex]"} ✅`);
        } else {
          logWarning(`Graph: 🔴 TRIANGULAR INCONSISTENCY — ${symFrom}/${symTo} (${edge.dex} ${edge.poolAddress.substring(0, 8)}...)`);
          logWarning(`  EXPECTED: ${symFrom}/${symTo} ≈ ${triCheck.derived.toFixed(4)} (via ${symFrom}/${triCheck.via}=${triCheck.viaPrice.toFixed(4)} × ${triCheck.via}/${symTo}=${(triCheck.derived / triCheck.viaPrice).toFixed(4)})`);
          logWarning(`  ACTUAL:   ${symFrom}/${symTo} = ${edge.price.toFixed(4)}`);
          logWarning(`  ERROR:    ${(triCheck.deviation * 100).toFixed(3)}%  ${triCheck.sameDex ? "[same-dex] REJECT" : "[cross-dex]"}`);
          const invalidThreshold = triCheck.sameDex ? 0.0005 : 0.05;
          if (triCheck.deviation > invalidThreshold) {
            return "INVALID_PRICE";
          }
        }
      }
    }

    return edge.health;
  }

  /** Check triangular consistency: (symFrom/symTo) vs (symFrom/intermediate)*(intermediate/symTo) */
  private checkTriangularConsistency(
    edge: PriceEdge,
    symFrom: string,
    symTo: string,
  ): { consistent: boolean; via: string; viaPrice: number; derived: number; deviation: number; sameDex: boolean } | null {
    if (!edge.price || edge.price <= 0) return null;

    // Try to find an intermediate token that connects from→to
    const fromMint = edge.from;
    const toMint = edge.to;

    // Find all nodes that connect to fromMint (as neighbors)
    const neighbors = this.getNeighbors(fromMint).filter((n) => n.token !== toMint);
    for (const n of neighbors) {
      // via edge: fromMint → neighborToken
      const viaEdge = this.getDirectPrice(fromMint, n.token);
      if (!viaEdge || !viaEdge.price || viaEdge.price <= 0) continue;

      // to edge: neighborToken → toMint
      const toEdge = this.getDirectPrice(n.token, toMint);
      if (!toEdge || !toEdge.price || toEdge.price <= 0) continue;

      // derived price = price(from→neighbor) * price(neighbor→to)
      const derived = viaEdge.price * toEdge.price;
      if (derived <= 0) continue;

      const sameDex = viaEdge.dex === edge.dex && toEdge.dex === edge.dex;
      const deviation = Math.abs(edge.price - derived) / Math.max(edge.price, derived);
      const viaSym = this.mintToSymbol(n.token);

      // Threshold: 0.03% for same DEX, 3% for cross DEX
      const threshold = sameDex ? 0.0003 : 0.03;

      return {
        consistent: deviation < threshold,
        via: viaSym,
        viaPrice: edge.price,
        derived,
        deviation,
        sameDex,
      };
    }

    return null; // no intermediate to check against
  }

  updateFromPool(snapshot: PoolStateSnapshot): void {
    if (snapshot.dataQuality === "CORRUPTED" || snapshot.dataQuality === "SUSPECT") {
      logWarning(`Graph: pool ${snapshot.poolAddress.substring(0, 8)}... dataQuality=${snapshot.dataQuality} — SKIPPING`);
      return;
    }

    if (snapshot.slot <= 0) {
      // Grace period: only downgrade if existing edge is older than 60s
      // This prevents WS glitches from immediately invalidating fresh edges
      const existingEdgeAB = this.findEdge(snapshot.mintA, snapshot.mintB, snapshot.poolAddress);
      const existingEdgeBA = this.findEdge(snapshot.mintB, snapshot.mintA, snapshot.poolAddress);
      const now = Date.now();
      if (existingEdgeAB && existingEdgeAB.health !== "INVALID" && existingEdgeAB.health !== "INVALID_SLOT") {
        if (now - existingEdgeAB.timestamp > 60_000) {
          existingEdgeAB.health = "INVALID_SLOT";
          existingEdgeAB.timestamp = now;
        }
      }
      if (existingEdgeBA && existingEdgeBA.health !== "INVALID" && existingEdgeBA.health !== "INVALID_SLOT") {
        if (now - existingEdgeBA.timestamp > 60_000) {
          existingEdgeBA.health = "INVALID_SLOT";
          existingEdgeBA.timestamp = now;
        }
      }
      logDebug(`Graph: pool ${snapshot.poolAddress.substring(0, 8)}... (${snapshot.dex}) — slot=${snapshot.slot} — grace=${existingEdgeAB ? (now - existingEdgeAB.timestamp) / 1000 : 0}s — keeping current state`);
      return;
    }

    const price = sqrtPriceX64ToPrice(BigInt(snapshot.sqrtPriceX64), snapshot.decimalsA, snapshot.decimalsB);
    const inversePrice = price > 0 ? 1 / price : 0;
    const liquidity = Number(snapshot.liquidity) || 0;
    const symA = this.mintToSymbol(snapshot.mintA);
    const symB = this.mintToSymbol(snapshot.mintB);

    // ── Reject unknown tokens ──
    // If mintToSymbol returns hex (not in known map), this is an auxiliary account, not a pool state
    if (symA === snapshot.mintA.substring(0, 6) || symB === snapshot.mintB.substring(0, 6)) {
      if (symA === snapshot.mintA.substring(0, 6)) {
        logDebug(`Graph: saltando pool ${snapshot.poolAddress.substring(0, 8)}... — mintA ${snapshot.mintA.substring(0, 12)}... no reconocido`);
      }
      if (symB === snapshot.mintB.substring(0, 6)) {
        logDebug(`Graph: saltando pool ${snapshot.poolAddress.substring(0, 8)}... — mintB ${snapshot.mintB.substring(0, 12)}... no reconocido`);
      }
      return;
    }

    // ── Strict inverse consistency check ──
    // Verify: price * inversePrice ≈ 1 (tolerance: 0.0001%)
    if (price > 0 && inversePrice > 0) {
      const product = price * inversePrice;
      if (Math.abs(product - 1) > INVERSE_TOLERANCE) {
        logWarning(`Graph: 🔴 BROKEN_PRICE_MATH — ${symA}/${symB} (${snapshot.dex} ${snapshot.poolAddress.substring(0, 8)}...) price=${price} inverse=${inversePrice} product=${product} — SKIPPING`);
        return;
      }
    }

    // ── Cross-dex median price sanity ──
    // Compute canonical key inline (canonicalMintA/B defined later)
    const getCanonicalKey = (symA: string, symB: string): string => {
      const priority = ["SOL", "USDC", "USDT", "JUP", "WIF", "RAY", "BONK", "POPCAT", "PYTH", "mSOL", "jitoSOL"];
      const ai = priority.indexOf(symA), bi = priority.indexOf(symB);
      return ai !== -1 && bi !== -1 && ai <= bi
        ? `${this.symbolToMint(symA)}:${this.symbolToMint(symB)}`
        : `${this.symbolToMint(symB)}:${this.symbolToMint(symA)}`;
    };
    const pairKey = getCanonicalKey(symA, symB);
    const canonicalBaseMint = pairKey.split(":")[0];
    // Normalize price to canonical orientation: if snapshot's mintA != canonical base, invert
    const isReverseOrientation = snapshot.mintA !== canonicalBaseMint;
    const normalizedPriceForComparison = isReverseOrientation ? (price > 0 ? 1 / price : price) : price;
    const siblingEdges = (this.edges.get(pairKey) || [])
      .filter((e) => e.poolAddress !== snapshot.poolAddress && e.health === "VALID" && e.price > 0);
    if (siblingEdges.length >= 1) {
      const prices = siblingEdges.map((e) => e.price).concat(normalizedPriceForComparison).sort((a, b) => a - b);
      const median = prices.length % 2 === 1
        ? prices[Math.floor(prices.length / 2)]
        : (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2;
      const medianDev = median > 0 ? Math.abs(normalizedPriceForComparison - median) / median : 0;
      if (medianDev > 0.5) {
        logWarning(`Graph: 🔴 PRICE_ANOMALY — ${symA}/${symB} (${snapshot.dex} ${snapshot.poolAddress.substring(0, 8)}...) price=$${normalizedPriceForComparison.toFixed(4)} vs median=$${median.toFixed(4)} dev=${(medianDev * 100).toFixed(1)}% (${isReverseOrientation ? "inverted" : "canonical"} orientation)`);
      }
    }

    // ── Comprehensive semantic validation ──
    const semResult = validateEdgeSemantics(
      symA, symB, price, inversePrice,
      snapshot.decimalsA, snapshot.decimalsB,
      liquidity, snapshot.tick, snapshot.fee,
    );

    if (semResult.health !== "VALID") {
      logWarning(`Graph: ❌ pool ${snapshot.poolAddress.substring(0, 8)}... (${snapshot.dex}) — ${semResult.health}: ${semResult.detail} — NO agregando edge`);
      const existingEdgeAB = this.findEdge(snapshot.mintA, snapshot.mintB, snapshot.poolAddress);
      const existingEdgeBA = this.findEdge(snapshot.mintB, snapshot.mintA, snapshot.poolAddress);
      if (existingEdgeAB) { existingEdgeAB.health = semResult.health; existingEdgeAB.timestamp = Date.now(); }
      if (existingEdgeBA) { existingEdgeBA.health = semResult.health; existingEdgeBA.timestamp = Date.now(); }
      if (existingEdgeAB || existingEdgeBA) {
        logInfo(`Graph: ⚡ edge ${semResult.health} para ${symA}/${symB} — pool ${snapshot.poolAddress.substring(0, 8)}... asilado`);
      }
      this.updateNodeLiquidity(snapshot.mintA, snapshot.mintB);
      return;
    }

    // ── Derived price / USD sanity check (via SOL/USDC anchor) ──
    const solUsdcRef = this.getDirectPrice(this.symbolToMint("SOL"), this.symbolToMint("USDC"));
    const usdcSolRef = this.getDirectPrice(this.symbolToMint("USDC"), this.symbolToMint("SOL"));
    const solUsd = solUsdcRef?.price || (usdcSolRef ? 1 / usdcSolRef.price : 0);
    if (solUsd > 0) {
      const derived = checkDerivedPrice(price, solUsd, symA, symB);
      if (!derived.valid) {
        logWarning(`Graph: ❌ pool ${snapshot.poolAddress.substring(0, 8)}... (${snapshot.dex}) — derived price fail: ${derived.reason} — NO agregando edge`);
        const existingEdgeAB = this.findEdge(snapshot.mintA, snapshot.mintB, snapshot.poolAddress);
        const existingEdgeBA = this.findEdge(snapshot.mintB, snapshot.mintA, snapshot.poolAddress);
        if (existingEdgeAB) { existingEdgeAB.health = "INVALID_PRICE"; existingEdgeAB.timestamp = Date.now(); }
        if (existingEdgeBA) { existingEdgeBA.health = "INVALID_PRICE"; existingEdgeBA.timestamp = Date.now(); }
        this.updateNodeLiquidity(snapshot.mintA, snapshot.mintB);
        return;
      }
    }

    const nodeA = this.ensureNode(snapshot.mintA, symA);
    const nodeB = this.ensureNode(snapshot.mintB, symB);

    const canonicalPair = semResult.canonicalPair;
    const [firstSymbol] = canonicalPair.split("/");
    const canonicalMintA = this.symbolToMint(firstSymbol);
    const canonicalMintB = this.symbolToMint(canonicalPair.split("/")[1]);

    // ── Edge creation with canonical orientation ──
    // forwardDir = from canonical base to canonical quote (e.g., SOL→BONK)
    // backwardDir = from canonical quote to canonical base (e.g., BONK→SOL)
    const isForwardPool = symA === firstSymbol;
    const forwardPrice = isForwardPool ? price : inversePrice;
    const backwardPrice = isForwardPool ? inversePrice : price;

    // Use registry fee when available (more reliable than on-chain fee for some DEXes)
    const registryEntry = POOL_REGISTRY.find(p => p.address === snapshot.poolAddress);
    const fee = registryEntry ? registryEntry.feeBps : snapshot.fee;

    const edgeForward: PriceEdge = {
      from: canonicalMintA, to: canonicalMintB,
      dex: snapshot.dex, poolAddress: snapshot.poolAddress,
      price: forwardPrice, inversePrice: backwardPrice,
      liquidity, fee,
      weight: Math.min(1, liquidity / 1_000_000),
      slot: snapshot.slot, timestamp: Date.now(),
      health: "VALID", source: snapshot.source === "ON_CHAIN_VALIDATED" ? "provider" : "ws_direct",
    };
    const edgeBackward: PriceEdge = {
      from: canonicalMintB, to: canonicalMintA,
      dex: snapshot.dex, poolAddress: snapshot.poolAddress,
      price: backwardPrice, inversePrice: forwardPrice,
      liquidity, fee,
      weight: edgeForward.weight,
      slot: snapshot.slot, timestamp: Date.now(),
      health: "VALID", source: edgeForward.source,
    };

    this.addEdge(edgeForward);
    this.addEdge(edgeBackward);

    // Cross-validate against sibling pools for the same canonical pair
    const xvF = this.crossValidateEdgeHealth(edgeForward);
    const xvB = this.crossValidateEdgeHealth(edgeBackward);
    if (xvF !== edgeForward.health) { edgeForward.health = xvF; this.addEdge(edgeForward); }
    if (xvB !== edgeBackward.health) { edgeBackward.health = xvB; this.addEdge(edgeBackward); }

    this.updateNodeLiquidity(canonicalMintA, canonicalMintB);

    const edgeCount = this.edges.get(`${canonicalMintA}:${canonicalMintB}`)?.length || 0;
    const logMsg = `Graph: ${canonicalPair} → ${snapshot.dex} price=$${forwardPrice.toFixed(6)} liq=${(liquidity / 1_000_000).toFixed(1)}M tick=${snapshot.tick} slot=${snapshot.slot} health=VALID (${edgeCount} edges total)`;
    logSuccess(`✅ ${logMsg}`);
  }

  seedFromRegistry(poolAddress: string, mintA: string, mintB: string, dex: string): void {
    const symA = this.mintToSymbol(mintA);
    const symB = this.mintToSymbol(mintB);

    this.ensureNode(mintA, symA);
    this.ensureNode(mintB, symB);

    const edgeAB: PriceEdge = {
      from: mintA, to: mintB, dex, poolAddress,
      price: 0, inversePrice: 0, liquidity: 0, fee: 0, weight: 0,
      slot: 0, timestamp: Date.now(),
      health: "INVALID", source: "seed",
    };
    const edgeBA: PriceEdge = {
      from: mintB, to: mintA, dex, poolAddress,
      price: 0, inversePrice: 0, liquidity: 0, fee: 0, weight: 0,
      slot: 0, timestamp: Date.now(),
      health: "INVALID", source: "seed",
    };
    this.addEdge(edgeAB);
    this.addEdge(edgeBA);

    logSuccess(`Graph: seeded ${symA}/${symB} (${dex}) â€” ${this.nodes.size} nodes, ${this.getEdgeCount()} edges total`);
  }

  private ensureNode(token: string, symbol: string): PriceNode {
    const existing = this.nodes.get(token);
    if (existing) return existing;
    const node: PriceNode = { token, symbol, totalLiquidity: 0, poolCount: 0 };
    this.nodes.set(token, node);
    return node;
  }

  private updateNodeLiquidity(mintA: string, mintB: string): void {
    for (const mint of [mintA, mintB]) {
      const node = this.nodes.get(mint);
      if (!node) continue;
      let totalLiq = 0;
      let poolCount = 0;
      for (const [, edgeList] of this.edges) {
        for (const e of edgeList) {
          if (e.from === mint && e.health === "VALID") {
            totalLiq += e.liquidity;
            poolCount++;
          }
        }
      }
      node.totalLiquidity = totalLiq;
      node.poolCount = poolCount;
    }
  }

  private findEdge(from: string, to: string, poolAddress: string): PriceEdge | undefined {
    const key = `${from}:${to}`;
    const existing = this.edges.get(key);
    return existing?.find((e) => e.poolAddress === poolAddress);
  }

  addEdge(edge: PriceEdge): void {
    const key = `${edge.from}:${edge.to}`;
    // Composite dedup key: dex + pool + direction (prevents same pool from being inserted twice)
    const dedupKey = `${edge.dex}:${edge.poolAddress}:${edge.from}:${edge.to}`;
    const existing = this.edges.get(key) || [];
    const idx = existing.findIndex((e) => {
      const ek = `${e.dex}:${e.poolAddress}:${e.from}:${e.to}`;
      return ek === dedupKey;
    });
    if (idx >= 0) {
      existing[idx] = edge;
      this.duplicateRejectedEdges++;
    } else {
      existing.push(edge);
      this.insertedEdges++;
    }
    this.edges.set(key, existing);
    const symFrom = this.mintToSymbol(edge.from);
    const symTo = this.mintToSymbol(edge.to);
    if (idx >= 0) {
      logDebug(`Graph edge: ${symFrom}→${symTo} (${edge.dex}) updated price=${edge.price} health=${edge.health}`);
    } else {
      logDebug(`Graph edge: ${symFrom}→${symTo} (${edge.dex}) inserted price=${edge.price} health=${edge.health}`);
    }
  }

  private insertedEdges = 0;
  private duplicateRejectedEdges = 0;

  getEdgeMetrics() {
    return {
      insertedEdges: this.insertedEdges,
      duplicateRejectedEdges: this.duplicateRejectedEdges,
      totalEdges: this.getEdgeCount(),
      validEdges: this.getValidEdgeCount(),
    };
  }

  getAllEdgesForKey(from: string, to: string): PriceEdge[] {
    const key = `${from}:${to}`;
    return this.edges.get(key)?.filter((e) => e.health === "VALID") || [];
  }

  getDirectPrice(from: string, to: string): PriceEdge | null {
    const key = `${from}:${to}`;
    const edges = this.edges.get(key);
    if (!edges || edges.length === 0) return null;
    const valid = edges.filter((e) => e.health === "VALID");
    if (valid.length === 0) return null;
    return valid.reduce((best, e) => e.liquidity > best.liquidity ? e : best);
  }

  getMarketSurface(label: string): MarketSurface | null {
    const edgesForPair: PriceEdge[] = [];
    for (const [, el] of this.edges) edgesForPair.push(...el);

    const [targetA, targetB] = label.split("/");

    const poolMap = new Map<string, MarketSurfaceEntry>();
    for (const e of edgesForPair) {
      const symFrom = this.mintToSymbol(e.from);
      const symTo = this.mintToSymbol(e.to);
      const forward = symFrom === targetA && symTo === targetB;
      const backward = symFrom === targetB && symTo === targetA;
      if (!forward && !backward) continue;

      // Normalize ALL prices to targetA/targetB direction
      let price: number;
      if (forward) {
        price = e.price > 0 ? e.price : (e.inversePrice > 0 ? 1 / e.inversePrice : 0);
      } else {
        price = e.price > 0 ? 1 / e.price : (e.inversePrice > 0 ? e.inversePrice : 0);
      }

      if (!poolMap.has(e.poolAddress)) {
        const poolData = marketState.getPool(e.poolAddress);
        poolMap.set(e.poolAddress, {
          poolAddress: e.poolAddress,
          dex: e.dex,
          price,
          liquidity: e.liquidity,
          fee: e.fee,
          health: e.health,
          age: Date.now() - e.timestamp,
          slot: e.slot,
          decimalsA: poolData?.decimalsA ?? 0,
          decimalsB: poolData?.decimalsB ?? 0,
          sqrtPriceX64: poolData?.sqrtPriceX64 ?? "0",
        });
      }
    }

    if (poolMap.size === 0) return null;

    const pools = Array.from(poolMap.values());
    const valid = pools.filter((p) => p.health === "VALID" && p.price > 0);
    const prices = valid.map((p) => p.price).sort((a, b) => a - b);

    // ── Weighted consensus price ──
    // Weight = liquidity^(0.5) * freshness * dex_diversity_bonus
    const MAX_AGE_MS = 60_000;
    const dexSet = new Set(valid.map((p) => p.dex));
    const uniqueDexCount = dexSet.size;
    const totalDexWeight = valid.reduce((sum, p, _, arr) => {
      const countForDex = arr.filter((x) => x.dex === p.dex).length;
      return sum + 1 / countForDex;
    }, 0);
    let consensusPrice = 0;
    let totalWeight = 0;
    const now = Date.now();
    for (const p of valid) {
      const liqWeight = Math.sqrt(p.liquidity) || 1;
      const freshnessWeight = p.age < MAX_AGE_MS ? 1 - (p.age / MAX_AGE_MS) * 0.5 : 0.5;
      const countForDex = valid.filter((x) => x.dex === p.dex).length;
      const dexWeight = (1 / countForDex) / totalDexWeight;
      const w = liqWeight * freshnessWeight * (1 + 0.2 * uniqueDexCount * dexWeight);
      consensusPrice += p.price * w;
      totalWeight += w;
    }
    consensusPrice = totalWeight > 0 ? consensusPrice / totalWeight : (prices.length > 0 ? prices[0] : 0);

    return {
      pair: label,
      symbolA: targetA,
      symbolB: targetB,
      pools,
      validCount: valid.length,
      totalCount: pools.length,
      bestBid: prices.length > 0 ? prices[prices.length - 1] : 0,
      bestAsk: prices.length > 0 ? prices[0] : 0,
      spreadRange: prices.length >= 2 ? ((prices[prices.length - 1] - prices[0]) / prices[0]) * 10000 : 0,
      consensusPrice,
      dexDiversity: uniqueDexCount,
    };
  }

  getMultiPoolSpread(label: string): { exists: boolean; pools: number; validPools: number; spreadPct: number; dexes: string[] } {
    const surface = this.getMarketSurface(label);
    if (!surface || surface.validCount < 2) {
      return { exists: false, pools: surface?.totalCount || 0, validPools: surface?.validCount || 0, spreadPct: 0, dexes: [] };
    }
    const dexes = [...new Set(surface.pools.filter((p) => p.health === "VALID").map((p) => p.dex))];
    return {
      exists: true,
      pools: surface.totalCount,
      validPools: surface.validCount,
      spreadPct: surface.spreadRange,
      dexes,
    };
  }

  getNeighbors(token: string): { token: string; edge: PriceEdge }[] {
    const neighbors: { token: string; edge: PriceEdge }[] = [];
    for (const [key, edgeList] of this.edges) {
      const [src, dst] = key.split(":");
      if (src !== token) continue;
      const valid = edgeList.filter((e) => e.health === "VALID");
      if (valid.length === 0) continue;
      const best = valid.reduce((b, e) => e.liquidity > b.liquidity ? e : b);
      neighbors.push({ token: dst, edge: best });
    }
    return neighbors;
  }

  enumeratePaths(from: string, maxHops: number = 3): { discovered: number; rejected: { stale: number; disconnected: number; invalid: number; duplicate: number } } {
    const results: Array<{ path: string[]; symbol: string[]; edge: PriceEdge[]; profit: number }> = [];
    const visited = new Set<string>();
    const rejected = { stale: 0, disconnected: 0, invalid: 0, duplicate: 0 };
    const seenKeys = new Set<string>();

    const dfs = (current: string, path: string[], symbols: string[], edges: PriceEdge[], depth: number) => {
      if (depth > maxHops) return;
      if (depth > 1 && current === from) {
        let price = 1;
        for (const e of edges) price *= e.price;
        const profit = (price - 1) * 100;
        const key = path.sort().join("-");
        if (seenKeys.has(key)) { rejected.duplicate++; return; }
        seenKeys.add(key);
        if (profit > 0.001) {
          results.push({ path: [...path], symbol: [...symbols], edge: [...edges], profit });
        } else {
          rejected.stale++;
        }
        return;
      }
      if (visited.has(current) && current !== from) {
        rejected.disconnected++;
        return;
      }

      visited.add(current);
      let neighborCount = 0;
      for (const [key, edgeList] of this.edges) {
        const [src, dst] = key.split(":");
        if (src !== current) continue;
        const valid = edgeList.filter((e) => e.health === "VALID");
        if (valid.length === 0) { rejected.invalid++; continue; }
        const bestEdge = valid.reduce((b, e) => e.liquidity > b.liquidity ? e : b);
        neighborCount++;
        path.push(dst);
        symbols.push(this.mintToSymbol(dst));
        edges.push(bestEdge);
        dfs(dst, path, symbols, edges, depth + 1);
        path.pop();
        symbols.pop();
        edges.pop();
      }
      if (current !== from) visited.delete(current);
    };

    logSuccess(`â•â•â•â•â•â•â•â•â•â• PATH ENUMERATION â•â•â•â•â•â•â•â•â•â•`);
    logInfo(`Starting: ${this.mintToSymbol(from)}`);
    const neighbors = this.getNeighbors(from);
    logInfo(`Neighbors: [${neighbors.map(n => this.mintToSymbol(n.token)).join(", ")}]`);

    dfs(from, [from], [this.mintToSymbol(from)], [], 0);

    logInfo(`Paths discovered: ${results.length}`);
    logInfo(`Rejected: ${Object.values(rejected).reduce((s, v) => s + v, 0)}`);
    logInfo(`  stale: ${rejected.stale}`);
    logInfo(`  disconnected: ${rejected.disconnected}`);
    logInfo(`  invalid: ${rejected.invalid}`);
    logInfo(`  duplicate: ${rejected.duplicate}`);
    logSuccess("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");

    return { discovered: results.length, rejected };
  }

  getArbitragePaths(from: string, maxHops: number = 3): Array<{ path: string[]; edge: PriceEdge[]; profit: number }> {
    const results: Array<{ path: string[]; edge: PriceEdge[]; profit: number }> = [];
    const visited = new Set<string>();

    const dfs = (current: string, path: string[], edges: PriceEdge[], depth: number) => {
      if (depth > maxHops) return;
      if (depth > 1 && current === from) {
        let price = 1;
        for (const e of edges) price *= e.price;
        const profit = (price - 1) * 100;
        if (profit > 0.01) results.push({ path: [...path], edge: [...edges], profit });
        return;
      }
      if (visited.has(current) && current !== from) return;

      visited.add(current);
      for (const [key, edgeList] of this.edges) {
        const [src] = key.split(":");
        if (src !== current) continue;
        const valid = edgeList.filter((e) =>
          e.health === "VALID" &&
          e.fee <= ROUTING_MAX_FEE_BPS &&
          e.liquidity >= ROUTING_MIN_LIQUIDITY &&
          Date.now() - e.timestamp < 30_000
        );
        if (valid.length === 0) continue;
        const bestEdge = valid.reduce((b, e) => e.liquidity > b.liquidity ? e : b);
        const dst = key.split(":")[1];
        path.push(dst);
        edges.push(bestEdge);
        dfs(dst, path, edges, depth + 1);
        path.pop();
        edges.pop();
      }
      if (current !== from) visited.delete(current);
    };

    dfs(from, [from], [], 0);
    return results.sort((a, b) => b.profit - a.profit);
  }

  getTriangularOpportunities(): Array<{
    route: string[];
    symbols: string[];
    spreadPct: number;
    profitUsd: number;
    hops: number;
  }> {
    const results: Array<{ route: string[]; symbols: string[]; spreadPct: number; profitUsd: number; hops: number }> = [];
    const tokens = Array.from(this.nodes.keys());
    const processed = new Set<string>();

    for (const token of tokens) {
      const paths = this.getArbitragePaths(token, 3);
      for (const p of paths) {
        if (p.path.length < 2) continue;
        const key = p.path.sort().join("-");
        if (processed.has(key)) continue;
        processed.add(key);
        const symbols = p.path.map((t) => this.mintToSymbol(t));
        results.push({
          route: p.path,
          symbols,
          spreadPct: p.profit,
          profitUsd: p.profit * 0.1,
          hops: p.path.length,
        });
      }
    }
    return results.sort((a, b) => b.spreadPct - a.spreadPct).slice(0, 20);
  }

  printPairDebug(label: string): void {
    const surface = this.getMarketSurface(label);
    const [symA, symB] = label.split("/");
    const bounds = PRICE_BOUNDS[label];
    logSuccess(`========== PAIR DEBUG: ${label} ==========`);
    logInfo(`Canonical: ${label}`);
    logInfo(`Meaning: ${bounds ? bounds.humanDesc : "unknown"} (${symB} per ${symA})`);
    logInfo(`Base: ${symA}  |  Quote: ${symB}`);
    logInfo(`Bounds: ${bounds ? `[${bounds.min.toExponential(2)}, ${bounds.max.toExponential(2)}]` : "unbounded"}`);

    if (!surface) {
      logWarning(`Status: NO_DATA — pair ${label} not found in graph`);
      logSuccess("==============================================");
      return;
    }

    const validCount = surface.pools.filter((p) => p.health === "VALID").length;
    const totalPools = surface.pools.length;

    for (const pool of surface.pools) {
      const healthIcon = pool.health === "VALID" ? "[OK]" :
        pool.health === "LOW_LIQUIDITY" ? "[LIQ]" :
        pool.health === "INVALID_PRICE" ? "[PRICE]" :
        pool.health === "INVALID_DECIMALS" ? "[DEC]" :
        pool.health === "INVALID_ORIENTATION" ? "[ORI]" :
        pool.health === "INVALID_FEE" ? "[FEE]" :
        pool.health === "INVALID_SLOT" ? "[SLOT]" :
        pool.health === "STALE" ? "[STALE]" :
        pool.health === "INVALID" ? "[INV]" : "[BAD]";
      const normPrice = pool.price;
      const inBounds = bounds ? (normPrice >= bounds.min && normPrice <= bounds.max) : true;
      const liqStr = pool.liquidity >= 1_000_000_000 ? `${(pool.liquidity / 1_000_000_000).toFixed(1)}B` : pool.liquidity >= 1_000_000 ? `${(pool.liquidity / 1_000_000).toFixed(0)}M` : pool.liquidity >= 1_000 ? `${(pool.liquidity / 1_000).toFixed(0)}K` : pool.liquidity.toFixed(0);
      logInfo(`  ${healthIcon} ${pool.dex} | price=$${normPrice.toFixed(6)} ${inBounds ? "✓" : "✗BOUNDS"} | liq=${liqStr} | fee=${pool.fee}bps | age=${(pool.age / 1000).toFixed(1)}s | slot=${pool.slot} | ${pool.health}`);
    }

    const overallStatus = validCount > 0 ? "VALID" : totalPools > 0 ? "NO_VALID_POOLS" : "NO_DATA";
    logInfo(`Status: ${overallStatus}  |  Pools: ${totalPools} (${validCount} valid, ${surface.validCount} VALID)`);
    logSuccess("==============================================");
  }

  printMarketSurface(label: string): void {
    const surface = this.getMarketSurface(label);
    if (!surface) {
      logInfo(`Surface ${label}: sin datos`);
      return;
    }
    logSuccess(`========== SURFACE SPREAD ==========`);
    logInfo(`PAIR: ${label}`);
    logInfo(`Pools: ${surface.totalCount} (${surface.validCount} valid)`);
    const spreadBps = surface.spreadRange;
    logInfo(`Best ASK (buy):  $${surface.bestAsk.toFixed(6)}`);
    logInfo(`Best BID (sell): $${surface.bestBid.toFixed(6)}`);
    logInfo(`Spread: +${spreadBps.toFixed(2)} bps`);
    for (const pool of surface.pools) {
      const healthIcon = pool.health === "VALID" ? "[OK]" : pool.health === "LOW_LIQUIDITY" ? "[LIQ]" :
        pool.health === "INVALID_PRICE" ? "[PRICE]" : pool.health === "INVALID_DECIMALS" ? "[DEC]" :
        pool.health === "INVALID_ORIENTATION" ? "[ORI]" : pool.health === "INVALID_FEE" ? "[FEE]" :
        pool.health === "INVALID_SLOT" ? "[SLOT]" : "[BAD]";
      logInfo(`  ${healthIcon} ${pool.dex} | $${pool.price.toFixed(6)} | liq: ${(pool.liquidity / 1_000_000).toFixed(1)}M | fee: ${pool.fee}bps | age: ${(pool.age / 1000).toFixed(1)}s | health: ${pool.health}`);
    }
    logSuccess("====================================");
  }

  printGraphSummary(): void {
    logSuccess("========== GRAPH SUMMARY ==========");
    logInfo(`Nodes: ${this.nodes.size}`);
    let totalEdges = 0;
    const pairEdges = new Map<string, PriceEdge[]>();
    for (const [key, edgeList] of this.edges) {
      totalEdges += edgeList.length;
      const from = this.mintToSymbol(key.split(":")[0]);
      const to = this.mintToSymbol(key.split(":")[1]);
      const pairKey = `${from}/${to}`;
      if (!pairEdges.has(pairKey)) pairEdges.set(pairKey, []);
      pairEdges.get(pairKey)!.push(...edgeList);
    }
    logInfo(`Total edges: ${totalEdges}`);

    for (const [pair, edges] of pairEdges) {
      const uniquePools = new Map<string, PriceEdge>();
      for (const e of edges) uniquePools.set(e.poolAddress, e);
      logInfo(`${pair}: ${uniquePools.size} pool(s)`);
      for (const [, e] of uniquePools) {
        const icon = e.health === "VALID" ? "[OK]" : e.health === "LOW_LIQUIDITY" ? "[LIQ]" :
          e.health === "INVALID_PRICE" ? "[PRICE]" : e.health === "INVALID_DECIMALS" ? "[DEC]" :
          e.health === "INVALID_ORIENTATION" ? "[ORI]" : e.health === "INVALID_FEE" ? "[FEE]" :
          e.health === "INVALID_SLOT" ? "[SLOT]" : "[BAD]";
        logInfo(`  ${icon} ${e.dex} | pool: ${e.poolAddress.substring(0, 12)}... | price: $${(e.price > 0 ? e.price : 0).toFixed(6)} | liq: ${(e.liquidity / 1_000_000).toFixed(1)}M | health: ${e.health} | src: ${e.source}`);
      }
    }
    logSuccess("====================================");
  }

  getNodeCount(): number { return this.nodes.size; }

  getEdgeCount(): number {
    let count = 0;
    for (const [, edgeList] of this.edges) count += edgeList.length;
    return count;
  }

  getValidEdgeCount(): number {
    let count = 0;
    for (const [, edgeList] of this.edges) {
      count += edgeList.filter((e) => e.health === "VALID").length;
    }
    return count;
  }

  /** Returns all raw edges (any health, any pair) for latency/staleness analysis */
  getAllEdgesRaw(): PriceEdge[] {
    const all: PriceEdge[] = [];
    for (const [, edgeList] of this.edges) {
      all.push(...edgeList);
    }
    return all;
  }

  getPairSurfaceLabels(): string[] {
    const labels = new Set<string>();
    for (const [key] of this.edges) {
      const parts = key.split(":");
      if (parts.length !== 2 || !parts[0] || !parts[1]) continue;
      const fromSymbol = this.mintToSymbol(parts[0]);
      const toSymbol = this.mintToSymbol(parts[1]);
      if (!fromSymbol || !toSymbol) continue;
      // Skip if either symbol is not in the known symbol map (resolved to mint hex = unknown)
      const fromMapped = this.mintSymbolMap[parts[0]];
      const toMapped = this.mintSymbolMap[parts[1]];
      if (!fromMapped || !toMapped) continue;
      const canonical = getCanonicalPair(fromSymbol, toSymbol);
      if (canonical.includes("/") && !canonical.startsWith("/") && !canonical.endsWith("/")) {
        labels.add(canonical);
      }
    }
    return Array.from(labels);
  }

  printConnectivityDebug(): void {
    const routes = [
      ["SOL", "USDC", "JUP", "SOL"],
      ["USDT", "SOL", "WIF", "SOL", "USDT"],
      ["SOL", "USDC", "PYTH", "SOL"],
    ];
    logSuccess("══════════ GRAPH CONNECTIVITY DEBUG ══════════");
    logInfo(`${this.getEdgeCount()} edges total, ${this.getValidEdgeCount()} valid, ${this.getNodeCount()} nodes`);
    logInfo(`Pairs: ${this.getPairSurfaceLabels().join(", ")}`);
    logInfo("");

    for (const route of routes) {
      logSuccess(`Route: ${route.join(" → ")}`);
      let allOk = true;
      for (let i = 0; i < route.length - 1; i++) {
        const a = route[i], b = route[i + 1];
        const mintA = this.symbolToMint(a);
        const mintB = this.symbolToMint(b);
        if (!mintA || !mintB) { logInfo(`  ❌ ${a}→${b}: mint no encontrado`); allOk = false; continue; }

        const forwardKey = `${mintA}:${mintB}`;
        const forwardEdges = this.edges.get(forwardKey);
        const forwardValid = forwardEdges?.filter((e) => e.health === "VALID") || [];
        const forwardOther = forwardEdges?.filter((e) => e.health !== "VALID") || [];

        const backwardKey = `${mintB}:${mintA}`;
        const backwardEdges = this.edges.get(backwardKey);
        const backwardValid = backwardEdges?.filter((e) => e.health === "VALID") || [];
        const backwardOther = backwardEdges?.filter((e) => e.health !== "VALID") || [];

        if (forwardValid.length === 0 && backwardValid.length === 0) {
          allOk = false;
          const issues: string[] = [];
          if (forwardOther.length > 0) {
            for (const e of forwardOther) {
              const ageSec = ((Date.now() - e.timestamp) / 1000).toFixed(1);
              issues.push(`forward ${e.dex}(health=${e.health},age=${ageSec}s,fee=${e.fee}bps,liq=${(e.liquidity / 1_000_000).toFixed(1)}M)`);
            }
          }
          if (backwardOther.length > 0) {
            for (const e of backwardOther) {
              const ageSec = ((Date.now() - e.timestamp) / 1000).toFixed(1);
              issues.push(`backward ${e.dex}(health=${e.health},age=${ageSec}s,fee=${e.fee}bps,liq=${(e.liquidity / 1_000_000).toFixed(1)}M)`);
            }
          }
          if (issues.length > 0) {
            logInfo(`  ❌ ${a}→${b}: NO valid edge — existing: ${issues.join("; ")}`);
          } else {
            logInfo(`  ❌ ${a}→${b}: missing edge (no pool data)`);
          }
        } else {
          const bestForward = forwardValid.sort((a, b) => b.liquidity - a.liquidity)[0];
          const bestBackward = backwardValid.sort((a, b) => b.liquidity - a.liquidity)[0];
          const fwd = bestForward ? `${bestForward.dex} liq=${(bestForward.liquidity / 1_000_000).toFixed(1)}M fee=${bestForward.fee}bps age=${((Date.now() - bestForward.timestamp) / 1000).toFixed(1)}s` : "none";
          const bwd = bestBackward ? `${bestBackward.dex} liq=${(bestBackward.liquidity / 1_000_000).toFixed(1)}M fee=${bestBackward.fee}bps age=${((Date.now() - bestBackward.timestamp) / 1000).toFixed(1)}s` : "none";
          logInfo(`  ✅ ${a}→${b}: fwd[${forwardValid.length}](${fwd}) | rev[${backwardValid.length}](${bwd})`);
        }
      }
      if (allOk) logInfo(`  ✅ ROUTE VIABLE — all edges present`);
      logInfo("");
    }
    logSuccess("══════════════════════════════════════════════");
  }

  mintToSymbol(mint: string): string {
    return this.mintSymbolMap[mint] || mint.substring(0, 6);
  }

  private mintSymbolMap: Record<string, string> = {
    "So11111111111111111111111111111111111111112": "SOL",
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": "USDC",
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": "USDT",
    "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN": "JUP",
    "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": "BONK",
    "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm": "WIF",
    "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": "RAY",
    "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So": "mSOL",
    "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn": "jitoSOL",
    "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr": "POPCAT",
    "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3": "PYTH",
  };

  private symbolToMintMap: Record<string, string> = {};

  constructor() {
    for (const [mint, sym] of Object.entries(this.mintSymbolMap)) {
      this.symbolToMintMap[sym] = mint;
    }
  }

  symbolToMint(symbol: string): string {
    return this.symbolToMintMap[symbol] || "";
  }

  clear(): void {
    this.nodes.clear();
    this.edges.clear();
  }
}

export const priceGraph = new PriceGraph();


