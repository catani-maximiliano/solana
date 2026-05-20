import { logWarning } from "../../logger";

interface BurstEvent {
  key: string;
  spread: number;
  velocity: number;
  detectedAt: number;
}

const BURST_VELOCITY_THRESHOLD = 5; // bps/sec
const BURST_SUPPRESSION_MS = 2_000;

export class BurstDetector {
  private bursts: BurstEvent[] = [];

  /** Detect if a spread observation indicates a burst */
  detect(key: string, spreadBps: number, velocity: number): boolean {
    if (velocity > BURST_VELOCITY_THRESHOLD && spreadBps > 3) {
      // Check suppression window
      const recent = this.bursts.filter(b => b.key === key && Date.now() - b.detectedAt < BURST_SUPPRESSION_MS);
      if (recent.length === 0) {
        this.bursts.push({ key, spread: spreadBps, velocity, detectedAt: Date.now() });
        logWarning(`[BURST] ${key} spread=${spreadBps.toFixed(1)}bps velocity=${velocity.toFixed(1)}bps/s`);
        return true;
      }
    }
    return false;
  }

  /** Check if a key is currently in burst state */
  inBurst(key: string): boolean {
    return this.bursts.some(b => b.key === key && Date.now() - b.detectedAt < BURST_SUPPRESSION_MS);
  }

  reset(): void { this.bursts = []; }
}

export const burstDetector = new BurstDetector();
