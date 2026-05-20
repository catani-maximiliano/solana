import { BundleSubmission } from "./types";
import { jitoRelayManager } from "./jitoRelayManager";
import { logInfo, logWarning } from "../../logger";

export class MultiRelaySender {
  /** Send bundle to multiple relays in parallel */
  async sendToAllRelays(bundleId: string, bundlePayload: any): Promise<BundleSubmission[]> {
    const relays = jitoRelayManager.getAllRelays();
    const results: BundleSubmission[] = [];
    const startTime = Date.now();

    const promises = relays.map(async (relay) => {
      const sentAt = Date.now();
      try {
        // Simulated send — replace with real gRPC/HTTP call
        const latencyMs = Date.now() - startTime;
        const submission: BundleSubmission = { id: bundleId, bundleUuid: `bundle_${Date.now()}`, relay, sentAt, landedSlot: 0, landed: false, included: false, latencyMs };
        results.push(submission);
        jitoRelayManager.recordOutcome(relay, true, latencyMs);
        logInfo(`[RELAY] sent ${bundleId.substring(0, 12)}... via ${relay} (${latencyMs}ms)`);
        return submission;
      } catch (err) {
        const latencyMs = Date.now() - sentAt;
        jitoRelayManager.recordOutcome(relay, false, latencyMs);
        results.push({ id: bundleId, bundleUuid: "", relay, sentAt, landedSlot: 0, landed: false, included: false, latencyMs, error: String(err) });
        logWarning(`[RELAY] failed ${bundleId.substring(0, 12)}... via ${relay} (${latencyMs}ms)`);
        return null;
      }
    });

    await Promise.allSettled(promises);
    return results;
  }

  /** Simulate bundle inclusion check */
  async checkInclusion(bundleUuid: string): Promise<boolean> {
    // Replace with real inclusion check
    return true;
  }
}

export const multiRelaySender = new MultiRelaySender();
