export const TOKEN_MINTS: Record<string, number> = {
  "So11111111111111111111111111111111111111112": 9,
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": 6,
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": 6,
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN": 6,
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": 5,
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": 6,
  "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So": 9,
  "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn": 9,
  "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm": 6,
  "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr": 9,
  "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3": 6,
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
  // ═══ SOL / USDC ═══
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
  },
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


  // ═══ JUP / SOL ═══
  {
    address: "C1MgLojNLWBKADvu9BHdtgzz1oZX4dZ5zGdGcgvvW8Wz",
    pair: "JUP/SOL",
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
  },
  {
    address: "EZVkeboWeXygtq8LMyENHyXdF5wpYrtExRNH9UwB1qYw",
    pair: "JUP/SOL",
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
  },

  // ═══ mSOL / SOL ═══
  {
    address: "HcjZvfeSNJbNkfLD4eEcRBr96AD3w1GpmMppaeRZf7ur",
    pair: "mSOL/SOL",
    dex: "Meteora DLMM",
    type: "dlmm",
    programKey: "meteoraDlmm",
    mintA: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
    mintB: "So11111111111111111111111111111111111111112",
    symbolA: "mSOL",
    symbolB: "SOL",
    decimalsA: 9,
    decimalsB: 9,
    tickSpacing: 1,
    feeBps: 4,
    verified: true,
  },
  {
    address: "8EzbUfvcRT1Q6RL462ekGkgqbxsPmwC5FMLQZhSPMjJ3",
    pair: "mSOL/SOL",
    dex: "Raydium CLMM",
    type: "clmm",
    programKey: "raydiumClmm",
    mintA: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
    mintB: "So11111111111111111111111111111111111111112",
    symbolA: "mSOL",
    symbolB: "SOL",
    decimalsA: 9,
    decimalsB: 9,
    tickSpacing: 8,
    feeBps: 5,
    verified: true,
  },

  // ═══ jitoSOL / SOL ═══
  {
    address: "Hp53XEtt4S8SvPCXarsLSdGfZBuUr5mMmZmX2DRNXQKp",
    pair: "jitoSOL/SOL",
    dex: "Whirlpool",
    type: "clmm",
    programKey: "whirlpool",
    mintA: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
    mintB: "So11111111111111111111111111111111111111112",
    symbolA: "jitoSOL",
    symbolB: "SOL",
    decimalsA: 9,
    decimalsB: 9,
    tickSpacing: 64,
    feeBps: 4,
    verified: true,
  },
  {
    address: "2uoKbPEidR7KAMYtY4x7xdkHXWqYib5k4CutJauSL3Mc",
    pair: "jitoSOL/SOL",
    dex: "Raydium CLMM",
    type: "clmm",
    programKey: "raydiumClmm",
    mintA: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
    mintB: "So11111111111111111111111111111111111111112",
    symbolA: "jitoSOL",
    symbolB: "SOL",
    decimalsA: 9,
    decimalsB: 9,
    tickSpacing: 8,
    feeBps: 5,
    verified: true,
  },

  // ═══ SOL / USDT ═══
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
  },
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
  },

  // ═══ USDC / PYTH (Meteora DLMM) ═══
  {
    address: "HghWoQH9YjB2prLqMgrVSCwhzvarSQrzjwHwqVYzyq2M",
    pair: "USDC/PYTH",
    dex: "Meteora DLMM",
    type: "dlmm",
    programKey: "meteoraDlmm",
    mintA: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    mintB: "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3",
    symbolA: "USDC",
    symbolB: "PYTH",
    decimalsA: 6,
    decimalsB: 6,
    tickSpacing: 1,
    feeBps: 5,
    verified: true,
  },

  // ═══ BONK / SOL ═══
  {
    address: "3ne4mWqdYuNiYrYZC9TrA3FcfuFdErghH97vNPbjicr1",
    pair: "BONK/SOL",
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
  },
  {
    address: "GtKKKs3yaPdHbQd2aZS4SfWhy8zQ988BJGnKNndLxYsN",
    pair: "BONK/SOL",
    dex: "Raydium CLMM",
    type: "clmm",
    programKey: "raydiumClmm",
    mintA: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    mintB: "So11111111111111111111111111111111111111112",
    symbolA: "BONK",
    symbolB: "SOL",
    decimalsA: 5,
    decimalsB: 9,
    tickSpacing: 64,
    feeBps: 25,
    verified: true,
  },

  // ═══ RAY / USDC ═══
  {
    address: "61R1ndXxvsWXXkWSyNkCxnzwd3zUNB8Q2ibmkiLPC8ht",
    pair: "RAY/USDC",
    dex: "Raydium CLMM",
    type: "clmm",
    programKey: "raydiumClmm",
    mintA: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
    mintB: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    symbolA: "RAY",
    symbolB: "USDC",
    decimalsA: 6,
    decimalsB: 6,
    tickSpacing: 8,
    feeBps: 25,
    verified: true,
  },

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
  },

  // ═══ PYTH / SOL (Raydium CLMM) ═══
  {
    address: "9n3dSLrERZQp95dHXywft7xV8D8xnGFLaUHtEhQVaXaC",
    pair: "PYTH/SOL",
    dex: "Raydium CLMM",
    type: "clmm",
    programKey: "raydiumClmm",
    mintA: "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3",
    mintB: "So11111111111111111111111111111111111111112",
    symbolA: "PYTH",
    symbolB: "SOL",
    decimalsA: 6,
    decimalsB: 9,
    tickSpacing: 64,
    feeBps: 25,
    verified: true,
  },

  // ═══ WIF / SOL (Raydium CLMM) ═══
  {
    address: "4mMDQ5kG9fFrBSQeedErsUoTBhY5KKnsKWGvenXRTwSy",
    pair: "WIF/SOL",
    dex: "Raydium CLMM",
    type: "clmm",
    programKey: "raydiumClmm",
    mintA: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
    mintB: "So11111111111111111111111111111111111111112",
    symbolA: "WIF",
    symbolB: "SOL",
    decimalsA: 6,
    decimalsB: 9,
    tickSpacing: 128,
    feeBps: 100,
    verified: true,
  },

  // ═══ WIF / SOL (Whirlpool) ═══
  {
    address: "D6NdKrKNQPmRZCCnG1GqXtF7MMoHB7qR6GU5TkG59Qz1",
    pair: "WIF/SOL",
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
  },

  // ═══ PYTH / SOL (Whirlpool) ═══
  {
    address: "8erNF5u3CHrqZJXtkfY8CjSxFYF1yqHmN8uDbAhk6tWM",
    pair: "PYTH/SOL",
    dex: "Whirlpool",
    type: "clmm",
    programKey: "whirlpool",
    mintA: "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3",
    mintB: "So11111111111111111111111111111111111111112",
    symbolA: "PYTH",
    symbolB: "SOL",
    decimalsA: 6,
    decimalsB: 9,
    tickSpacing: 8,
    feeBps: 5,
    verified: true,
  },

  // ═══ USDC / JUP (Orca Whirlpool) ═══
  {
    address: "4Ui9QdczV3cqCho7rAqkiLtXnW8vPPuYYBPKKkz3szP",
    pair: "USDC/JUP",
    dex: "Whirlpool",
    type: "clmm",
    programKey: "whirlpool",
    mintA: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    mintB: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    symbolA: "USDC",
    symbolB: "JUP",
    decimalsA: 6,
    decimalsB: 6,
    tickSpacing: 64,
    feeBps: 4,
    verified: true,
  },

  // ═══ USDC / JUP (Meteora VP) ═══
  {
    address: "E1nhUcSbuZrg3pcRdM6CeSXD9GJNpWqWYSkLvuip1CFm",
    pair: "USDC/JUP",
    dex: "Meteora DLMM",
    type: "dlmm",
    programKey: "meteoraDlmm",
    mintA: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    mintB: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    symbolA: "USDC",
    symbolB: "JUP",
    decimalsA: 6,
    decimalsB: 6,
    tickSpacing: 1,
    feeBps: 5,
    verified: true,
  },

  // ═══ USDC / JUP (Meteora VD) ═══
  {
    address: "HyhMt7jPKJ1LLXQTm5wjf5f4kWqAeTeKQZvMq8TtZnPV",
    pair: "USDC/JUP",
    dex: "Meteora DLMM",
    type: "dlmm",
    programKey: "meteoraDlmm",
    mintA: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    mintB: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    symbolA: "USDC",
    symbolB: "JUP",
    decimalsA: 6,
    decimalsB: 6,
    tickSpacing: 1,
    feeBps: 5,
    verified: true,
  },

  // ═══ WIF / USDC (Orca Whirlpool) ═══
  // WARNING: This pool was previously miscategorized as SOL/WIF.
  // On-chain data shows mintA=WIF, mintB=USDC.
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
  },

  // ═══ USDC / PYTH (Orca Whirlpool) ═══
  {
    address: "EQtwgp38jR521VftG3iC2jfu4MXnQu8aZ9fr4CRhZy2s",
    pair: "USDC/PYTH",
    dex: "Whirlpool",
    type: "clmm",
    programKey: "whirlpool",
    mintA: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    mintB: "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3",
    symbolA: "USDC",
    symbolB: "PYTH",
    decimalsA: 6,
    decimalsB: 6,
    tickSpacing: 64,
    feeBps: 5,
    verified: true,
  },

  // ═══ USDT / JUP (Orca Whirlpool) ═══
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
  },

  // ═══ BONK / SOL (Raydium CLMM #2) ═══
  {
    address: "G7mw1d83ismcQJKkzt62Ug4noXCjVhu3eV7U5EMgge6Z",
    pair: "BONK/SOL",
    dex: "Raydium CLMM",
    type: "clmm",
    programKey: "raydiumClmm",
    mintA: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    mintB: "So11111111111111111111111111111111111111112",
    symbolA: "BONK",
    symbolB: "SOL",
    decimalsA: 5,
    decimalsB: 9,
    tickSpacing: 64,
    feeBps: 100,
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
  const pairs = getUniquePairs();
  return `${POOL_REGISTRY.length} pools, ${pairs.length} pairs (${dexes.join(", ")})`;
}
