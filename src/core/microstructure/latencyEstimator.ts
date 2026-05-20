import { LatencyEstimate } from "./types";

const BLOCK_TIME_MS = 400; // Solana block time estimate
const ESTIMATED_LEADER_SLOTS = 2;

export class LatencyEstimator {
  /**
   * Estimate true latency from a swap event.
   * ingestLatency: time from block to our system
   * chainLatency: time from slot to block finality
   * totalLatency: end-to-end
   */
  estimate(slot: number, receivedAt: number, currentSlot: number): LatencyEstimate {
    const slotLag = Math.max(0, currentSlot - slot);
    const ingestLatency = Math.max(0, Date.now() - receivedAt);

    // Chain latency: slot lag × block time
    const chainLatencyMs = slotLag * BLOCK_TIME_MS;

    // Leader approximation: how many slots ago this was confirmed
    const leaderLagApprox = Math.max(0, slotLag - ESTIMATED_LEADER_SLOTS) * BLOCK_TIME_MS;

    const totalLatency = ingestLatency + chainLatencyMs + leaderLagApprox;

    // Confidence decreases with higher latency
    const confidence = Math.max(0, Math.min(1, 1 - totalLatency / 2000));

    return { ingestLatencyMs: Math.round(ingestLatency), chainLatencyMs: Math.round(chainLatencyMs), totalLatencyMs: Math.round(totalLatency), confidence };
  }
}

export const latencyEstimator = new LatencyEstimator();
