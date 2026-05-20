export function computePriority(
  expectedValueBps: number,
  survivalMs: number,
  fillProb: number,
  confidence: number,
  toxicity: string,
): number {
  let score = 0;

  // EV: higher = higher priority
  score += Math.min(50, expectedValueBps * 2);

  // Survival: longer = higher priority
  score += Math.min(20, survivalMs / 50);

  // Fill probability: higher = higher priority
  score += fillProb * 15;

  // Confidence: higher = higher priority
  score += confidence * 10;

  // Toxicity penalty
  if (toxicity === "TOXIC") score -= 30;
  else if (toxicity === "RISKY") score -= 10;

  return Math.round(Math.max(0, Math.min(100, score)));
}
