export enum ExecutionGrade {
  PRIMARY = "EXECUTION_GRADE",
  SECONDARY = "SECONDARY_EXECUTION_GRADE",
}

export interface ExecutionGradePool {
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
  grade: ExecutionGrade;
}

export const ALLOWED_POOLS: ExecutionGradePool[] = [
  // ═══════════════════════════════════════════════
  // PRIMARY EXECUTION GRADE
  // ═══════════════════════════════════════════════

  // SOL/USDC — Orca Whirlpool ts=4 — $23-30M TVL
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
    grade: ExecutionGrade.PRIMARY,
  },

  // SOL/USDC — Raydium CLMM ts=1 — $5.27M TVL
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
    feeBps: 1,
    grade: ExecutionGrade.PRIMARY,
  },

  // SOL/USDT — Raydium CLMM ts=1 — $4.8M TVL
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
    tickSpacing: 1,
    feeBps: 1,
    grade: ExecutionGrade.PRIMARY,
  },

  // ═══════════════════════════════════════════════
  // SECONDARY EXECUTION GRADE
  // ═══════════════════════════════════════════════

  // RAY/SOL — Raydium CLMM ts=1 — $750K TVL
  {
    address: "2AXXcN6oN9bBT5owwmTH53C7QHUXvhLeu718Kqt8rvY2",
    pair: "RAY/SOL",
    dex: "Raydium CLMM",
    type: "clmm",
    programKey: "raydiumClmm",
    mintA: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
    mintB: "So11111111111111111111111111111111111111112",
    symbolA: "RAY",
    symbolB: "SOL",
    decimalsA: 6,
    decimalsB: 9,
    tickSpacing: 1,
    feeBps: 1,
    grade: ExecutionGrade.SECONDARY,
  },
];

export const DISABLED_POOLS: string[] = [
  // Removed — secondary/stale pools
  "8Pm2kZpnxD3hoMmt4bjStX2Pw2Z9abpbHzZxMPqxPmie",
  "DJNtGuBGEQiUCWE8F981M2C3ZghZt2XLD8f2sQdZ6rsZ",
  "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2",
  "FksffEqnBRixYGR791Qw2MgdU7zNCpHVFYBL4Fa4qVuH",
  "4QU2NpRaqmKMvPSwVKQDeW4V6JFEKJdkzbzdauumD9qN",
  "HRYEjwdo3bZ1TpXKWKcezqiwSV2Ywuh4LxMa2PzoCnG6",
  "BZtgQEyS6eXUXicYPHecYQ7PybqodXQMvkjUbP4R8mUU",
  "HJPjoWUrhoZzkNfRpHuieeFk9WcZWjwy6PBjZ81ngndJ",
  "2QdhepnKRTLjjSqPL1PtKNwqrUkoLee5Gqs8bvZhRdMv",
  "CYbD9RaToYMtWKA7QZyoLahnHdWq553Vm62Lh6qWtuxq",
  "8sLbNZoA1cfnvMJLPfp98ZLAnFSYCFApfJKMbiXNLwxj",
];

export function getExecutionGradePools(includeSecondary: boolean = false): ExecutionGradePool[] {
  return ALLOWED_POOLS.filter(p => includeSecondary || p.grade === ExecutionGrade.PRIMARY);
}

export function getPrimaryPools(): ExecutionGradePool[] {
  return ALLOWED_POOLS.filter(p => p.grade === ExecutionGrade.PRIMARY);
}

export function getPoolByAddress(address: string): ExecutionGradePool | undefined {
  return ALLOWED_POOLS.find(p => p.address === address);
}

export function isDisabledPool(address: string): boolean {
  return DISABLED_POOLS.includes(address);
}

export function isExecutionGradePool(address: string): boolean {
  return ALLOWED_POOLS.some(p => p.address === address);
}

export function isPrimaryPool(address: string): boolean {
  return ALLOWED_POOLS.some(p => p.address === address && p.grade === ExecutionGrade.PRIMARY);
}
