import { EventCandidate } from "./types";
import { logInfo, logSuccess, logDebug } from "../../logger";

export class CandidateEmitter {
  private emitted = new Set<string>();

  /** Emit a candidate (log + dedup + track) */
  emit(candidate: EventCandidate): void {
    const dedupKey = candidate.id;
    if (this.emitted.has(dedupKey)) return;
    this.emitted.add(dedupKey);

    logSuccess(`[CANDIDATE] ${candidate.pair} net=+${candidate.netBps.toFixed(1)}bps profit=$${candidate.expectedProfitUsd.toFixed(4)}`);
    logDebug(`  route: ${candidate.route} | sourceSlot: ${candidate.sourceSlot} | confidence: ${(candidate.confidence * 100).toFixed(0)}%`);

    // Prune old entries
    if (this.emitted.size > 500) {
      this.emitted.clear();
    }
  }

  reset(): void {
    this.emitted.clear();
  }
}

export const candidateEmitter = new CandidateEmitter();
