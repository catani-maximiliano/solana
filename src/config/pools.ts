export const TOKEN_MINTS: Record<string, number> = {
  "So11111111111111111111111111111111111111112": 9,   // SOL
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": 6, // USDC
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

export const POOL_REGISTRY: PoolRegistryEntry[] = [
  // ════════════════════════════════════════════════════════════════
  // EXECUTION-GRADE — SOL/USDC pools with real HFT activity
  // ════════════════════════════════════════════════════════════════

  // SOL/USDC — Orca Whirlpool ts=4 — $23-30M TVL — PRIMARY
  {
    address: "Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE",
    pair: "SOL/USDC",
    dex: "Whirlpool",
    type: "clmm",
    programKey: "whirlpool",
    mintA: "So11111111111111111111111111111111111111112",
    mintB: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    symbolA: "SOL",
    symbolB: "USDC",
    decimalsA: 9,
    decimalsB: 6,
    tickSpacing: 4,
    feeBps: 4,
    verified: true,
    enabled: true,
    tier: 1,
  },

  // SOL/USDC — Raydium CLMM ts=1 — $5.27M TVL — PRIMARY
  {
    address: "8sLbNZoA1cfnvMJLPfp98ZLAnFSYCFApfJKMbiXNLwxj",
    pair: "SOL/USDC",
    dex: "Raydium CLMM",
    type: "clmm",
    programKey: "raydiumClmm",
    mintA: "So11111111111111111111111111111111111111112",
    mintB: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    symbolA: "SOL",
    symbolB: "USDC",
    decimalsA: 9,
    decimalsB: 6,
    tickSpacing: 1,
    feeBps: 1,
    verified: true,
    enabled: true,
    tier: 1,
  },

  // SOL/USDC — Raydium CLMM (legacy) — $2.1M TVL — SECONDARY
  {
    address: "3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv",
    pair: "SOL/USDC",
    dex: "Raydium CLMM",
    type: "clmm",
    programKey: "raydiumClmm",
    mintA: "So11111111111111111111111111111111111111112",
    mintB: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    symbolA: "SOL",
    symbolB: "USDC",
    decimalsA: 9,
    decimalsB: 6,
    tickSpacing: 1,
    feeBps: 5,
    verified: true,
    enabled: true,
    tier: 1,
  },
];

// ── Blacklist: pools that must NEVER be subscribed or used ──
export const POOL_BLACKLIST: string[] = [
  "HJPjoWUrhoZzkNfRpHuieeFk9WcZWjwy6PBjZ81ngndJ", // Whirlpool ts=64 1bps — low activity $200K TVL, stale >100s
  "2QdhepnKRTLjjSqPL1PtKNwqrUkoLee5Gqs8bvZhRdMv", // SOL/USDC Raydium ts=8 — low activity $522K TVL
  "CYbD9RaToYMtWKA7QZyoLahnHdWq553Vm62Lh6qWtuxq", // SOL/USDC — 25bps stale
];

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
