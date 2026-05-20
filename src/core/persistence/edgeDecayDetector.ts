import { executionHistoryStore } from "./executionHistoryStore";
import { logWarning } from "../../logger";

export class EdgeDecayDetector {
  detect(pair: string): { decayed: boolean; oldRate: number; recentRate: number } | null {
    const all = executionHistoryStore.getAll().filter(e => e.pair === pair);
    if (all.length < 20) return null;

    const half = Math.floor(all.length / 2);
    const oldHalf = all.slice(0, half);
    const recentHalf = all.slice(-half);

    const oldDetected = oldHalf.reduce((s, e) => s + Math.abs(e.detectedBps), 0);
    const oldCaptured = oldHalf.reduce((s, e) => s + Math.max(0, e.capturedBps), 0);
    const recentDetected = recentHalf.reduce((s, e) => s + Math.abs(e.detectedBps), 0);
    const recentCaptured = recentHalf.reduce((s, e) => s + Math.max(0, e.capturedBps), 0);

    const oldRate = oldDetected > 0 ? oldCaptured / oldDetected : 0;
    const recentRate = recentDetected > 0 ? recentCaptured / recentDetected : 0;

    if (recentRate < oldRate * 0.7) {
      logWarning(`[EDGE_DECAY] ${pair} capture: ${(oldRate * 100).toFixed(0)}% → ${(recentRate * 100).toFixed(0)}% over ${half} trades`);
      return { decayed: true, oldRate, recentRate };
    }

    return { decayed: false, oldRate, recentRate };
  }

  reset(): void {}
}

export const edgeDecayDetector = new EdgeDecayDetector();
