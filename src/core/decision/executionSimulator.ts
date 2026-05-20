import { estimateSlippage } from "../execution/slippageModel";
import { simulateFill } from "../execution/fillSimulator";
import { logDebug } from "../../logger";

export interface SimulationResult {
  simSlippageBps: number;
  simFillProb: number;
  simImpactAdjBps: number;
  simCollapsed: boolean;
}

/**
 * Simulate execution at a future time (latencyMs from now).
 * Tests if the edge would still be profitable after latency.
 */
export function simulateExecution(
  grossBps: number,
  feesBps: number,
  liquidity: number,
  velocity: number,
  toxicity: number,
  latencyMs: number,
  persistenceScore: number,
): SimulationResult {
  // Simulate slippage at execution time
  const slippage = estimateSlippage(100, liquidity, velocity, toxicity);
  const simSlippageBps = slippage.expected + (latencyMs / 1000) * 0.5; // reduced extra slippage from latency

  // Simulate fill
  const fill = simulateFill(latencyMs, liquidity, grossBps, persistenceScore);
  const simFillProb = fill.probability;

  // Net after simulation
  const simNetBps = grossBps - feesBps - simSlippageBps;
  const simImpactAdjBps = simNetBps * fill.probability * fill.survivalOdds;

  // Collapse check
  const simCollapsed = simImpactAdjBps <= 0;

  if (simCollapsed) {
    logDebug(`[SIM] REJECTED: gross=${grossBps.toFixed(1)} latency=${latencyMs}ms simNet=${simNetBps.toFixed(1)} adj=${simImpactAdjBps.toFixed(2)}`);
  }

  return {
    simSlippageBps: Math.round(simSlippageBps * 10) / 10,
    simFillProb: Math.round(simFillProb * 100) / 100,
    simImpactAdjBps: Math.round(simImpactAdjBps * 100) / 100,
    simCollapsed,
  };
}
