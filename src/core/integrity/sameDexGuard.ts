import { logInfo } from "../../logger";

export class SameDexGuard {
  reject(
    poolA_dex: string,
    poolB_dex: string,
    poolA_addr: string,
    poolB_addr: string,
    pair: string,
  ): { allowed: boolean; reason?: string } {
    if (poolA_dex === poolB_dex) {
      logInfo(`[SAME_DEX] DROP ${pair} ${poolA_dex}→${poolA_dex} pre-routing`);
      return {
        allowed: false,
        reason: `same-dex arbitrage prohibited: ${poolA_dex}→${poolA_dex}`,
      };
    }
    return { allowed: true };
  }

  isCrossDex(poolA_dex: string, poolB_dex: string): boolean {
    return poolA_dex !== poolB_dex;
  }
}

export const sameDexGuard = new SameDexGuard();
