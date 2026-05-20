import { CaptureBreakdown } from "./types";
import { logInfo } from "../../logger";

export function analyzeCapture(
  expectedAlpha: number,
  capturedAlpha: number,
  slippageLoss: number,
  bundleLoss: number,
  latencyLoss: number,
  delayedEntryLoss: number,
): CaptureBreakdown {
  return {
    expectedAlpha: Math.round(expectedAlpha * 100) / 100,
    capturedAlpha: Math.round(capturedAlpha * 100) / 100,
    slippageLoss: Math.round(slippageLoss * 100) / 100,
    bundleLoss: Math.round(bundleLoss * 100) / 100,
    latencyLoss: Math.round(latencyLoss * 100) / 100,
    delayedEntryLoss: Math.round(delayedEntryLoss * 100) / 100,
    captureRate: expectedAlpha > 0 ? Math.round(capturedAlpha / expectedAlpha * 100) : 0,
  };
}

export function logCaptureAnalysis(breakdown: CaptureBreakdown): void {
  logInfo(`[CAPTURE_OPT] expected=${breakdown.expectedAlpha.toFixed(1)}bps captured=${breakdown.capturedAlpha.toFixed(1)}bps rate=${breakdown.captureRate}%`);
  logInfo(`  losses: slippage=${breakdown.slippageLoss.toFixed(1)}bps bundle=${breakdown.bundleLoss.toFixed(1)}bps latency=${breakdown.latencyLoss.toFixed(1)}bps delayed=${breakdown.delayedEntryLoss.toFixed(1)}bps`);
}
