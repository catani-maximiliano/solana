import { CrowdingLevel } from "./types";

export function classifyCrowding(
  estimatedBots: number,
  spreadBps: number,
  pair: string,
  isCrossDex: boolean,
): CrowdingLevel {
  const popularPairs = ["SOL/USDC", "SOL/USDT"];
  if (popularPairs.includes(pair) && spreadBps > 10 && isCrossDex) return "MEV_SWARM";
  if (estimatedBots > 20) return "MEV_SWARM";
  if (estimatedBots > 10) return "CROWDED";
  if (estimatedBots > 5) return "MEDIUM_VIS";
  if (estimatedBots > 2) return "LOW_VIS";
  return "PRIVATE";
}
