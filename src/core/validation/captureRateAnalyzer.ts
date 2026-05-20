import { CaptureBreakdown } from "./types";

export class CaptureRateAnalyzer {
  private byPair = new Map<string, { detected: number; captured: number }>();
  private byRegime = new Map<string, { detected: number; captured: number }>();
  private byRelay = new Map<string, { detected: number; captured: number }>();

  record(pair: string, regime: string, relay: string, detectedBps: number, capturedBps: number): void {
    const pairs = this.byPair.get(pair) || { detected: 0, captured: 0 };
    pairs.detected += Math.abs(detectedBps);
    pairs.captured += Math.max(0, capturedBps);
    this.byPair.set(pair, pairs);

    const regimes = this.byRegime.get(regime) || { detected: 0, captured: 0 };
    regimes.detected += Math.abs(detectedBps);
    regimes.captured += Math.max(0, capturedBps);
    this.byRegime.set(regime, regimes);

    const relays = this.byRelay.get(relay) || { detected: 0, captured: 0 };
    relays.detected += Math.abs(detectedBps);
    relays.captured += Math.max(0, capturedBps);
    this.byRelay.set(relay, relays);
  }

  getBreakdown(): CaptureBreakdown {
    const toObj = (map: Map<string, { detected: number; captured: number }>) => {
      const obj: Record<string, number> = {};
      for (const [k, v] of map) {
        obj[k] = v.detected > 0 ? Math.round((v.captured / v.detected) * 1000) / 10 : 0;
      }
      return obj;
    };
    return { byPair: toObj(this.byPair), byRegime: toObj(this.byRegime), byRelay: toObj(this.byRelay), byTiming: {} };
  }

  reset(): void { this.byPair.clear(); this.byRegime.clear(); this.byRelay.clear(); }
}

export const captureRateAnalyzer = new CaptureRateAnalyzer();
