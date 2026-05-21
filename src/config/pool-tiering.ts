import { ALLOWED_POOLS, ExecutionGrade, DISABLED_POOLS } from "./execution-grade-pools";

export enum PoolTier {
  TIER_1 = "TIER_1",
  TIER_2 = "TIER_2",
  DISABLED = "DISABLED",
}

export interface PoolTierInfo {
  address: string;
  label: string;
  tier: PoolTier;
  reason?: string;
}

export const POOL_TIER_MAP: Record<string, PoolTierInfo> = {};

for (const p of ALLOWED_POOLS) {
  POOL_TIER_MAP[p.address] = {
    address: p.address,
    label: `${p.dex} ${p.symbolA}/${p.symbolB} (${p.grade === ExecutionGrade.PRIMARY ? "primary" : "secondary"})`,
    tier: p.grade === ExecutionGrade.PRIMARY ? PoolTier.TIER_1 : PoolTier.TIER_2,
  };
}

for (const addr of DISABLED_POOLS) {
  POOL_TIER_MAP[addr] = {
    address: addr,
    label: `${addr.substring(0, 8)}...`,
    tier: PoolTier.DISABLED,
    reason: "SECONDARY_OR_STALE_POOL",
  };
}

export function getPoolTier(address: string): PoolTier {
  return POOL_TIER_MAP[address]?.tier ?? PoolTier.DISABLED;
}

export function getTier1Pools(): string[] {
  return Object.values(POOL_TIER_MAP)
    .filter(p => p.tier === PoolTier.TIER_1)
    .map(p => p.address);
}

export function isTier1Pool(address: string): boolean {
  return getPoolTier(address) === PoolTier.TIER_1;
}
