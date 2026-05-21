export const TOKEN_MINTS: Record<string, number> = {
  "So11111111111111111111111111111111111111112": 9,
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": 6,
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": 6,
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN": 6,
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": 5,
  "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm": 6,
  "HZ1JovNiVvGqszpscjkMGKMeAaS3hyM2HFNxYvW7mZC": 6,
  "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr": 9,
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
  // TIER 1 — Core liquidity (SOL/USDC, SOL/USDT)
  // ════════════════════════════════════════════════════════════════
  // Source: Curated Liquidity Registry v1.0.0

  // SOL/USDC — Orca Whirlpool (ts=4) — $23-30M TVL — PRIMARY
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

  // SOL/USDC — Orca Whirlpool (ts=64) — $200K TVL — fee ref
  {
    address: "HJPjoWUrhoZzkNfRpHuieeFk9WcZWjwy6PBjZ81ngndJ",
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
    tickSpacing: 64,
    feeBps: 1,
    verified: true,
    enabled: true,
    tier: 1,
  },

  // SOL/USDC — Raydium CLMM 0.01% — $5.27M TVL — PRIMARY
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

  // SOL/USDC — Raydium CLMM 0.05% — $522K TVL — tertiary
  {
    address: "2QdhepnKRTLjjSqPL1PtKNwqrUkoLee5Gqs8bvZhRdMv",
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
    tickSpacing: 8,
    feeBps: 5,
    verified: true,
    enabled: true,
    tier: 1,
  },

  // ════════════════════════════════════════════════════════════════
  // TIER 2 — Memecoin liquidity (SOL/WIF, SOL/BONK, SOL/JUP)
  // ════════════════════════════════════════════════════════════════

  // SOL/WIF — Orca Whirlpool — $816K TVL
  // Note: EP2ib6dYd is Raydium AMM v4, not CLMM — no provider yet
  {
    address: "D6NdKrKNQPmRZCCnG1GqXtF7MMoHB7qR6GU5TkG59Qz1",
    pair: "SOL/WIF",
    dex: "Whirlpool",
    type: "clmm",
    programKey: "whirlpool",
    mintA: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
    mintB: "So11111111111111111111111111111111111111112",
    symbolA: "WIF",
    symbolB: "SOL",
    decimalsA: 6,
    decimalsB: 9,
    tickSpacing: 4,
    feeBps: 4,
    verified: true,
    enabled: true,
    tier: 2,
  },

  // SOL/BONK — Orca Whirlpool — $881K TVL
  {
    address: "3ne4mWqdYuNiYrYZC9TrA3FcfuFdErghH97vNPbjicr1",
    pair: "SOL/BONK",
    dex: "Whirlpool",
    type: "clmm",
    programKey: "whirlpool",
    mintA: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    mintB: "So11111111111111111111111111111111111111112",
    symbolA: "BONK",
    symbolB: "SOL",
    decimalsA: 5,
    decimalsB: 9,
    tickSpacing: 64,
    feeBps: 16,
    verified: true,
    enabled: true,
    tier: 2,
  },

  // SOL/JUP — Raydium CLMM 0.05% — $222K TVL
  {
    address: "EZVkeboWeXygtq8LMyENHyXdF5wpYrtExRNH9UwB1qYw",
    pair: "SOL/JUP",
    dex: "Raydium CLMM",
    type: "clmm",
    programKey: "raydiumClmm",
    mintA: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    mintB: "So11111111111111111111111111111111111111112",
    symbolA: "JUP",
    symbolB: "SOL",
    decimalsA: 6,
    decimalsB: 9,
    tickSpacing: 8,
    feeBps: 5,
    verified: true,
    enabled: true,
    tier: 2,
  },

  // SOL/JUP — Orca Whirlpool — tertiary
  {
    address: "C1MgLojNLWBKADvu9BHdtgzz1oZX4dZ5zGdGcgvvW8Wz",
    pair: "SOL/JUP",
    dex: "Whirlpool",
    type: "clmm",
    programKey: "whirlpool",
    mintA: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    mintB: "So11111111111111111111111111111111111111112",
    symbolA: "JUP",
    symbolB: "SOL",
    decimalsA: 6,
    decimalsB: 9,
    tickSpacing: 64,
    feeBps: 4,
    verified: true,
    enabled: true,
    tier: 2,
  },

  // ════════════════════════════════════════════════════════════════
  // EXISTING POOLS FROM PREVIOUS REGISTRY (clean, verified)
  // ════════════════════════════════════════════════════════════════

  // SOL/USDC — Raydium CLMM (existing)
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

  // SOL/USDT — Raydium CLMM
  {
    address: "3nMFwZXwY1s1M5s8vYAHqd4wGs4iSxXE4LRoUMMYqEgF",
    pair: "SOL/USDT",
    dex: "Raydium CLMM",
    type: "clmm",
    programKey: "raydiumClmm",
    mintA: "So11111111111111111111111111111111111111112",
    mintB: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    symbolA: "SOL",
    symbolB: "USDT",
    decimalsA: 9,
    decimalsB: 6,
    tickSpacing: 8,
    feeBps: 5,
    verified: true,
    enabled: true,
    tier: 1,
  },

  // SOL/USDT — Raydium CLMM (alt)
  {
    address: "6kT4MhDqKrkWikaGpFCvYsk45BUKXEe2gTpNGAR1YcjS",
    pair: "SOL/USDT",
    dex: "Raydium CLMM",
    type: "clmm",
    programKey: "raydiumClmm",
    mintA: "So11111111111111111111111111111111111111112",
    mintB: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    symbolA: "SOL",
    symbolB: "USDT",
    decimalsA: 9,
    decimalsB: 6,
    tickSpacing: 8,
    feeBps: 5,
    verified: true,
    enabled: true,
    tier: 1,
  },

  // WIF/USDC — Orca Whirlpool
  {
    address: "5tekMFqXyxoGCSZ6PT7Mb4cxuAqkPHYnTMRvcwM8YShu",
    pair: "WIF/USDC",
    dex: "Whirlpool",
    type: "clmm",
    programKey: "whirlpool",
    mintA: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
    mintB: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    symbolA: "WIF",
    symbolB: "USDC",
    decimalsA: 6,
    decimalsB: 6,
    tickSpacing: 64,
    feeBps: 4,
    verified: true,
    enabled: true,
    tier: 2,
  },

  // POPCAT/SOL — Orca Whirlpool
  {
    address: "AHTTzwf3GmVMJdxWM8v2MSxyjZj8rQR6hyAC3g9477Yj",
    pair: "POPCAT/SOL",
    dex: "Whirlpool",
    type: "clmm",
    programKey: "whirlpool",
    mintA: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
    mintB: "So11111111111111111111111111111111111111112",
    symbolA: "POPCAT",
    symbolB: "SOL",
    decimalsA: 9,
    decimalsB: 9,
    tickSpacing: 64,
    feeBps: 25,
    verified: true,
    enabled: true,
    tier: 3,
  },

  // USDT/JUP — Orca Whirlpool
  {
    address: "AyFajbj7QEi8CizFnfEjJn3vSUxgDjVKob4A8i618YJD",
    pair: "USDT/JUP",
    dex: "Whirlpool",
    type: "clmm",
    programKey: "whirlpool",
    mintA: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    mintB: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    symbolA: "USDT",
    symbolB: "JUP",
    decimalsA: 6,
    decimalsB: 6,
    tickSpacing: 8,
    feeBps: 4,
    verified: true,
    enabled: true,
    tier: 3,
  },
];

// ── Blacklist: pools that must NEVER be subscribed or used ──
export const POOL_BLACKLIST: string[] = [
  "4mMDQ5kG9fFrBSQeedErsUoTBhY5KKnsKWGvenXRTwSy", // SOL/WIF — CORRUPT price≤0
  "9n3dSLrERZQp95dHXywft7xV8D8xnGFLaUHtEhQVaXaC", // SOL/PYTH — STALE liq=0
  "GtKKKs3yaPdHbQd2aZS4SfWhy8zQ988BJGnKNndLxYsN", // SOL/BONK — CORRUPT
  "G7mw1d83ismcQJKkzt62Ug4noXCjVhu3eV7U5EMgge6Z", // SOL/BONK — CORRUPT
  "4Ui9QdczV3cqCho7rAqkiLtXnW8vPPuYYBPKKkz3szP", // USDC/JUP — WRONG_OWNER
  "E1nhUcSbuZrg3pcRdM6CeSXD9GJNpWqWYSkLvuip1CFm", // USDC/JUP Meteora — INCOMPATIBLE
  "HyhMt7jPKJ1LLXQTm5wjf5f4kWqAeTeKQZvMq8TtZnPV", // USDC/JUP Meteora VD — INCOMPATIBLE
  "7RJ5qmsgmvUKK5QtCLT9qHpQMegkiULppHRBNuWso12E", // JUP/USDC — FAKE_LIQUIDITY $445
  "HcjZvfeSNJbNkfLD4eEcRBr96AD3w1GpmMppaeRZf7ur", // SOL/mSOL — INVALID_SLOT
  "2uoKbPEidR7KAMYtY4x7xdkHXWqYib5k4CutJauSL3Mc", // SOL/jitoSOL — CORRUPT
  "8EzbUfvcRT1Q6RL462ekGkgqbxsPmwC5FMLQZhSPMjJ3", // SOL/mSOL Raydium — CORRUPT
  "Hp53XEtt4S8SvPCXarsLSdGfZBuUr5mMmZmX2DRNXQKp", // SOL/jitoSOL Whirlpool — CORRUPT
  "HghWoQH9YjB2prLqMgrVSCwhzvarSQrzjwHwqVYzyq2M", // USDC/PYTH Meteora — stale/low liq
  "EQtwgp38jR521VftG3iC2jfu4MXnQu8aZ9fr4CRhZy2s", // USDC/PYTH Orca — liquidity zero
  "EP2ib6dYdEeqD8MfE2ezHCxX3kP3K2eLKkirfPm5eyMx", // SOL/WIF Raydium — AMM v4, no CLMM provider
  "CYbD9RaToYMtWKA7QZyoLahnHdWq553Vm62Lh6qWtuxq", // SOL/USDC — 25bps stale
  "61R1ndXxvsWXXkWSyNkCxnzwd3zUNB8Q2ibmkiLPC8ht", // RAY/USDC — low vol
  "9VSwL2dnZ3u6T74tWL34H7EfeiuDEQwRvdDuw4YPQUwK", // USDC/JUP Raydium — wrong token
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
