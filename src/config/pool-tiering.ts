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

export const POOL_TIER_MAP: Record<string, PoolTierInfo> = {
  "Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE": { address: "Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE", label: "Whirlpool ts=4 (primary)", tier: PoolTier.TIER_1 },
  "HJPjoWUrhoZzkNfRpHuieeFk9WcZWjwy6PBjZ81ngndJ": { address: "HJPjoWUrhoZzkNfRpHuieeFk9WcZWjwy6PBjZ81ngndJ", label: "Whirlpool ts=64 (secondary)", tier: PoolTier.TIER_1 },
  "8sLbNZoA1cfnvMJLPfp98ZLAnFSYCFApfJKMbiXNLwxj": { address: "8sLbNZoA1cfnvMJLPfp98ZLAnFSYCFApfJKMbiXNLwxj", label: "Raydium CLMM ts=1 (primary)", tier: PoolTier.TIER_1 },
  "2QdhepnKRTLjjSqPL1PtKNwqrUkoLee5Gqs8bvZhRdMv": { address: "2QdhepnKRTLjjSqPL1PtKNwqrUkoLee5Gqs8bvZhRdMv", label: "Raydium CLMM ts=8", tier: PoolTier.TIER_2 },
  "3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv": { address: "3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv", label: "Raydium CLMM (legacy ts=1)", tier: PoolTier.DISABLED, reason: "low activity, duplicate of 8sLbNZoA" },
};

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
