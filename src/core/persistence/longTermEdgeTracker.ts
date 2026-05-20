import { RollingMetrics } from "./types";
import { executionHistoryStore } from "./executionHistoryStore";

const WINDOWS = { "1h": 3_600_000, "24h": 86_400_000, "7d": 604_800_000, "30d": 2_592_000_000 };

export class LongTermEdgeTracker {
  getRolling(windowLabel: string): RollingMetrics {
    const ms = (WINDOWS as any)[windowLabel];
    if (!ms) return { captureRate: 0, sharpe: 0, leakage: 0, pnl: 0, sampleSize: 0 };

    const entries = executionHistoryStore.getWindow(ms);
    if (entries.length === 0) return { captureRate: 0, sharpe: 0, leakage: 0, pnl: 0, sampleSize: 0 };

    const totalDetected = entries.reduce((s, e) => s + Math.abs(e.detectedBps), 0);
    const totalCaptured = entries.reduce((s, e) => s + Math.max(0, e.capturedBps), 0);
    const totalPnl = entries.reduce((s, e) => s + e.profitSol, 0);
    const returns = entries.map(e => e.capturedBps);
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sq, v) => sq + (v - mean) ** 2, 0) / returns.length;
    const std = Math.sqrt(variance);

    return {
      captureRate: totalDetected > 0 ? Math.round((totalCaptured / totalDetected) * 1000) / 10 : 0,
      sharpe: std > 0 ? Math.round(mean / std * 100) / 100 : 0,
      leakage: totalDetected > 0 ? Math.round((totalDetected - totalCaptured) / totalDetected * 1000) / 10 : 0,
      pnl: Math.round(totalPnl * 1000000) / 1000000,
      sampleSize: entries.length,
    };
  }

  getAllWindows(): Record<string, RollingMetrics> {
    const result: Record<string, RollingMetrics> = {};
    for (const key of Object.keys(WINDOWS)) {
      result[key] = this.getRolling(key);
    }
    return result;
  }

  reset(): void {}
}

export const longTermEdgeTracker = new LongTermEdgeTracker();
