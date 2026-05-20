import { SlippageResult } from "./types";

export function calculateSlippageLimit(
  grossBps: number,
  volatility: string,
  sweepProbability: number,
  toxicity: string,
  persistenceScore: number,
): SlippageResult {
  let limitBps = grossBps * 0.5; // default: half the spread

  // Volatility adjustment
  if (volatility === "HIGH") limitBps *= 1.5;
  if (volatility === "EXTREME") limitBps *= 2.0;

  // Sweep risk: tight slippage to avoid adverse selection
  if (sweepProbability > 0.5) limitBps *= 0.7;

  // Toxicity: tight for toxic environments
  if (toxicity === "TOXIC") limitBps *= 0.5;
  if (toxicity === "RISKY") limitBps *= 0.8;

  // Persistence: reliable edges can have slightly looser slippage
  if (persistenceScore > 0.7) limitBps *= 1.2;

  limitBps = Math.max(3, Math.min(100, Math.round(limitBps)));

  return {
    limitBps,
    adaptive: true,
    confidence: Math.round((1 - limitBps / 100) * 100) / 100,
  };
}
