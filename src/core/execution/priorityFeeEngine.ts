import { PriorityFeeResult } from "./types";

const BASE_FEE = 5_000;
const MAX_FEE = 100_000;

export function calculatePriorityFee(
  expectedPnlBps: number,
  volatility: string,
  competition: number,
  urgency: number,
): PriorityFeeResult {
  // Congestion: higher during high vol/competition
  let congestionMultiplier = 1.0;
  if (volatility === "HIGH") congestionMultiplier = 2.0;
  if (volatility === "EXTREME") congestionMultiplier = 3.0;
  if (competition > 0.7) congestionMultiplier *= 1.5;

  // Urgency: higher for time-sensitive opportunities
  const urgencyMultiplier = Math.max(0.5, Math.min(3.0, urgency));

  // PnL adjustment: higher expected profit can support higher fees
  const pnlMultiplier = Math.max(1.0, expectedPnlBps / 20);

  const microLamports = Math.round(BASE_FEE * congestionMultiplier * urgencyMultiplier * pnlMultiplier);

  return {
    microLamports: Math.min(MAX_FEE, Math.max(1_000, microLamports)),
    baseFee: BASE_FEE,
    congestionMultiplier,
    urgencyMultiplier,
  };
}
