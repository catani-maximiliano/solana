import { LatencyReplayResult } from "./types";

const DECAY_PER_MS = 0.02; // 2% EV decay per ms of additional latency

export function simulateLatencyReplay(originalBps: number, originalLatencyMs: number): LatencyReplayResult {
  const at10ms = originalBps * (1 - (originalLatencyMs - 10) * DECAY_PER_MS / 100);
  const at25ms = originalBps * (1 - (originalLatencyMs - 25) * DECAY_PER_MS / 100);
  const at50ms = originalBps * (1 - (originalLatencyMs - 50) * DECAY_PER_MS / 100);

  const leakageBps = originalBps - at10ms;

  return {
    at10ms: Math.round(at10ms * 10) / 10,
    at25ms: Math.round(at25ms * 10) / 10,
    at50ms: Math.round(at50ms * 10) / 10,
    leakageBps: Math.round(Math.max(0, leakageBps) * 10) / 10,
  };
}
