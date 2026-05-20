import { NormalizedRealtimeEvent } from "../../streams/registry/eventTypes";
import { priceGraph } from "../../graph";
import { EventCandidate } from "./types";
import { logInfo, logDebug } from "../../logger";

const CANDIDATE_DEDUP_MS = 500;
const MIN_NET_BPS = 3;
const MIN_PROFIT_USD = 0.01;

export class OpportunityEngine {
  private lastCandidates = new Map<string, number>(); // route → timestamp
  private totalCandidatesGenerated = 0;

  /** Detect opportunities triggered by a swap event */
  detect(event: NormalizedRealtimeEvent): EventCandidate[] {
    const found: EventCandidate[] = [];

    // Get affected pair from the swap pool
    const pool = event.pool;
    const pairLabels = this.findAffectedPairs(pool);

    for (const pair of pairLabels) {
      const surface = priceGraph.getMarketSurface(pair);
      if (!surface || surface.validCount < 2) continue;

      const valid = surface.pools
        .filter(p => p.health === "VALID" && p.price > 0)
        .sort((a, b) => a.price - b.price);

      if (valid.length < 2) continue;

      const bestAsk = valid[0];
      const bestBid = valid[valid.length - 1];
      const grossBps = bestAsk.price > 0 ? ((bestBid.price - bestAsk.price) / bestAsk.price) * 10000 : 0;

      // Skip stale comparisons: age-based, not slot-based
      if (bestAsk.age > 10_000 || bestBid.age > 10_000) continue;
      if (bestAsk.dex === bestBid.dex) continue;

      const feesBps = bestAsk.fee + bestBid.fee;
      const netBps = Math.max(0, grossBps - feesBps);

      if (netBps < MIN_NET_BPS) continue;

      const profitUsd = netBps / 10000 * 100;

      const candidate: EventCandidate = {
        id: `${pair}:${Date.now()}`,
        pair,
        route: `${bestAsk.dex}→${bestBid.dex}`,
        type: "pair",
        grossBps,
        netBps,
        feesBps,
        slippageBps: 0,
        confidence: Math.min(1, netBps / 50),
        expectedProfitUsd: profitUsd,
        sourceSlot: event.slot,
        detectedAt: Date.now(),
        triggerEvent: event.topic,
      };

      // Dedup: same route within 500ms
      const dedupKey = `${pair}:${bestAsk.dex}→${bestBid.dex}:${Math.round(grossBps)}`;
      const last = this.lastCandidates.get(dedupKey);
      if (last && Date.now() - last < CANDIDATE_DEDUP_MS) {
        logDebug(`[OPPORTUNITY] dedup ${dedupKey}`);
        continue;
      }
      this.lastCandidates.set(dedupKey, Date.now());

      found.push(candidate);
    }

    this.totalCandidatesGenerated += found.length;
    return found;
  }

  /** Find pairs that involve the given pool address */
  private findAffectedPairs(poolAddress: string): string[] {
    const affected: string[] = [];
    const labels = priceGraph.getPairSurfaceLabels();
    for (const label of labels) {
      const surface = priceGraph.getMarketSurface(label);
      if (!surface) continue;
      if (surface.pools.some(p => p.poolAddress === poolAddress)) {
        affected.push(label);
      }
    }
    return affected;
  }

  getStats() {
    return { totalCandidates: this.totalCandidatesGenerated };
  }

  reset(): void {
    this.lastCandidates.clear();
    this.totalCandidatesGenerated = 0;
  }
}

export const opportunityEngine = new OpportunityEngine();
