import { TimingComparison } from "./types";

export function compareTimingDecisions(
  bestDelayMs: number,
  realizedNetBps: number,
  realizedAtFireNow: number,
  realizedAt50ms: number,
  realizedAt100ms: number,
): { bestTiming: TimingComparison; improvementBps: number } {
  const options = [
    { delay: "FIRE_NOW" as TimingComparison, value: realizedAtFireNow },
    { delay: "WAIT_50MS" as TimingComparison, value: realizedAt50ms },
    { delay: "WAIT_100MS" as TimingComparison, value: realizedAt100ms },
  ];

  let best = options[0];
  for (const opt of options) {
    if (opt.value > best.value) best = opt;
  }

  const improvement = best.value - realizedNetBps;

  return {
    bestTiming: best.delay,
    improvementBps: Math.round(improvement * 10) / 10,
  };
}
