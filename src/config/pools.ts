import { ALLOWED_POOLS, DISABLED_POOLS, isExecutionGradePool, isDisabledPool } from "./execution-grade-pools";

export const TOKEN_MINTS: Record<string, number> = {
  "So11111111111111111111111111111111111111112": 9,   // SOL
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": 6, // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": 6, // USDT
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": 6, // RAY
};

export interface PoolRegistryEntry {
  address: string;
  pair: string;
  dex: string;
  type: "clmm" | "dlmm" | "amm_v4";
  programKey: string;
  mintA: string;
  mintB: string;
  symbolA: string;
  symbolB: string;
  decimalsA: number;
  decimalsB: number;
  tickSpacing: number;
  feeBps: number;
  verified: boolean;
  enabled: boolean;
  tier: number;
}

// Execution-grade pool universe — built from allowlist
export const POOL_REGISTRY: PoolRegistryEntry[] = ALLOWED_POOLS.map(p => ({
  address: p.address,
  pair: p.pair,
  dex: p.dex,
  type: p.type,
  programKey: p.programKey,
  mintA: p.mintA,
  mintB: p.mintB,
  symbolA: p.symbolA,
  symbolB: p.symbolB,
  decimalsA: p.decimalsA,
  decimalsB: p.decimalsB,
  tickSpacing: p.tickSpacing,
  feeBps: p.feeBps,
  verified: true,
  enabled: true,
  tier: p.grade === "EXECUTION_GRADE" ? 1 : 2,
}));

export const POOL_BLACKLIST: string[] = [...DISABLED_POOLS];

export function getPoolsByDex(dex: string): PoolRegistryEntry[] {
  return POOL_REGISTRY.filter((p) => p.dex === dex && p.enabled);
}

export function getPoolsByPair(pair: string): PoolRegistryEntry[] {
  return POOL_REGISTRY.filter((p) => p.pair === pair && p.enabled);
}

export function getUniquePairs(): string[] {
  return [...new Set(POOL_REGISTRY.filter((p) => p.enabled).map((p) => p.pair))];
}

let cachedEnabledPools: PoolRegistryEntry[] | null = null;

export function getEnabledPools(restrictToSolUsdc: boolean = false): PoolRegistryEntry[] {
  if (cachedEnabledPools !== null && !restrictToSolUsdc) return cachedEnabledPools;
  const filtered = POOL_REGISTRY.filter((p) => {
    if (!p.enabled) return false;
    if (restrictToSolUsdc && p.pair !== "SOL/USDC") return false;
    return true;
  });
  if (!restrictToSolUsdc) cachedEnabledPools = filtered;
  return filtered;
}

export function invalidatePoolCache(): void {
  cachedEnabledPools = null;
}

export function getPoolSummary(restrictToSolUsdc?: boolean): string {
  const enabled = getEnabledPools(restrictToSolUsdc);
  const dexes = [...new Set(enabled.map((p) => p.dex))];
  const pairs = [...new Set(enabled.map((p) => p.pair))];
  return `${enabled.length} pools, ${pairs.length} pairs, ${dexes.length} dexes (${dexes.join(", ")})`;
}
