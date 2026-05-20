import { ShadowOutcome } from "./types";

export function evaluateOutcome(
  expectedBps: number,
  realizedBps: number,
  expectedProfit: number,
  realizedProfit: number,
  spreadCollapsed: boolean,
  falsePositive: boolean,
): ShadowOutcome {
  if (falsePositive || spreadCollapsed) return "FALSE_POSITIVE";

  if (realizedProfit <= 0 && expectedProfit > 0) return "MISSED_ALPHA";

  if (realizedProfit <= 0) return "LOSS";

  const captureRatio = realizedBps / Math.max(0.1, expectedBps);

  if (captureRatio >= 0.8) return "WIN";
  if (captureRatio >= 0.4) return "PARTIAL_WIN";
  if (captureRatio > 0) return "FLAT";

  return "LOSS";
}
