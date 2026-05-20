export interface EVIteration {
  delayMs: number;
  ev: number;
  confidence: number;
}

export function estimateOptimalEntry(
  currentNetBps: number,
  velocity: number,
  acceleration: number,
  decay: number,
  volatility: string,
): EVIteration[] {
  const results: EVIteration[] = [];
  const delays = [0, 50, 100, 250];

  for (const d of delays) {
    // Simulate net at delay time
    let net = currentNetBps + velocity * (d / 1000);
    // Add acceleration effect
    net += acceleration * 0.5 * (d / 1000) ** 2;
    // Subtract decay
    net += decay * (d / 1000);

    // Volatility penalty
    const volPenalty = volatility === "HIGH" ? 0.2 : volatility === "EXTREME" ? 0.4 : 0;
    const ev = net * (1 - volPenalty);
    const confidence = Math.max(0, Math.min(1, 1 - (d / 500) - volPenalty));

    results.push({ delayMs: d, ev: Math.round(ev * 100) / 100, confidence: Math.round(confidence * 100) / 100 });
  }

  return results;
}
