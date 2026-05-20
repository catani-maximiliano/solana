import { EdgeAnalysis } from "./types";
import { logInfo } from "../../logger";

export function validateEdge(
  detectedAlpha: number,
  capturedAlpha: number,
  totalTrades: number,
): EdgeAnalysis {
  const leakedAlpha = detectedAlpha - capturedAlpha;
  const captureRate = detectedAlpha > 0 ? (capturedAlpha / detectedAlpha) * 100 : 0;
  const netEdge = capturedAlpha;
  const isSignificant = totalTrades >= 10 && captureRate > 10;
  const confidence = Math.min(1, totalTrades / 100);

  return {
    detectedAlpha: Math.round(detectedAlpha * 100) / 100,
    capturedAlpha: Math.round(capturedAlpha * 100) / 100,
    leakedAlpha: Math.round(leakedAlpha * 100) / 100,
    captureRate: Math.round(captureRate * 10) / 10,
    netEdge: Math.round(netEdge * 100) / 100,
    isSignificant,
    confidence: Math.round(confidence * 100) / 100,
  };
}

export function logEdgeAnalysis(analysis: EdgeAnalysis): void {
  logInfo(`[EDGE] detected=${analysis.detectedAlpha.toFixed(1)}bps captured=${analysis.capturedAlpha.toFixed(1)}bps rate=${analysis.captureRate}% net=${analysis.netEdge.toFixed(1)}bps significant=${analysis.isSignificant} conf=${(analysis.confidence * 100).toFixed(0)}%`);
}
