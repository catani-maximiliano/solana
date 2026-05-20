import { TimingDecision, TimingOutput, ExecutionWindowType } from "./types";
import { classifyMomentum } from "./spreadMomentum";
import { classifyWindow } from "./executionWindow";
import { estimateOptimalEntry, EVIteration } from "./optimalEntry";
import { logInfo } from "../../logger";

export function decideTiming(
  pair: string,
  currentNetBps: number,
  velocity: number,
  acceleration: number,
  decay: number,
  ageMs: number,
  lifetimeMs: number,
  toxicity: string,
  volatility: string,
): TimingOutput {
  const momentum = classifyMomentum(velocity, acceleration, ageMs);
  const windowType = classifyWindow(momentum, lifetimeMs, decay, toxicity, volatility);
  const iterations = estimateOptimalEntry(currentNetBps, velocity, acceleration, decay, volatility);

  // Find best EV
  let best: EVIteration = iterations[0];
  for (const iter of iterations) {
    if (iter.ev > best.ev) best = iter;
  }

  // Map delay to decision
  let decision: TimingDecision;
  if (windowType === "TOXIC_FAKE") decision = "DISCARD";
  else if (windowType === "INSTANT" || best.delayMs === 0) decision = "FIRE_NOW";
  else if (best.delayMs <= 50) decision = "WAIT_50MS";
  else if (best.delayMs <= 100) decision = "WAIT_100MS";
  else if (best.delayMs <= 250) decision = "WAIT_250MS";
  else decision = "DISCARD";

  // Extra safety: discard if all EVs are negative
  if (iterations.every(i => i.ev <= 0)) {
    decision = "DISCARD";
  }

  // Extra safety: discard if window is TOXIC_FAKE
  if (windowType === "TOXIC_FAKE") {
    decision = "DISCARD";
  }

  logInfo(`[TIMING] ${pair} net=${currentNetBps.toFixed(1)}bps vel=${velocity.toFixed(1)} accel=${acceleration.toFixed(1)} momentum=${momentum} window=${windowType} decision=${decision} bestEV=${best.ev.toFixed(1)} @${best.delayMs}ms`);

  return {
    decision,
    recommendedDelayMs: best.delayMs,
    expectedEVAtExecution: best.ev,
    timingConfidence: best.confidence,
    windowType,
    spreadMomentum: momentum,
  };
}
