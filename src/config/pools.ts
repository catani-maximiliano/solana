export const TOKEN_MINTS: Record<string, number> = {
  "So11111111111111111111111111111111111111112": 9,
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": 6,
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": 6,
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN": 6,
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": 5,
  "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm": 6,
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": 6,
  "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE": 6,
  "pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biYPD": 6,
  "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL": 6,
  "HjpQZQ3Lhp5WN32MFMks7boEADPPvA7sA5L6bQK2P3C": 6,
  "MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5": 6,
  "ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82": 6,
  "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So": 9,
  "2weMjPLLybRMMva1fM3U31goWWrCpF59CHWNhnCJ9Vyh": 6,
  "Df6yfrKC8kZE3KNkrHERKzAETcxhYJk3NqoyrNTwDx3e": 6,
  "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr": 6,
};

export interface PoolRegistryEntry {
  address: string;
  pair: string;
  dex: string;
  type: "clmm" | "dlmm";
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
}

export const POOL_REGISTRY: PoolRegistryEntry[] = [
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
    tickSpacing: 64,
    feeBps: 4,
    verified: true,
  },
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
  },
  {
    address: "CYbD9RaToYMtWKA7QZyoLahnHdWq553Vm62Lh6qWtuxq",
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
    feeBps: 25,
    verified: true,
  },
];

export function getPoolsByDex(dex: string): PoolRegistryEntry[] {
  return POOL_REGISTRY.filter((p) => p.dex === dex);
}

export function getPoolsByPair(pair: string): PoolRegistryEntry[] {
  return POOL_REGISTRY.filter((p) => p.pair === pair);
}

export function getUniquePairs(): string[] {
  return [...new Set(POOL_REGISTRY.map((p) => p.pair))];
}

export function getPoolSummary(): string {
  const dexes = [...new Set(POOL_REGISTRY.map((p) => p.dex))];
  return `${POOL_REGISTRY.length} pools (${dexes.join(", ")})`;
}
