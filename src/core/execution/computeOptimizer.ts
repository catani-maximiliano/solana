import { ComputeEstimate } from "./types";

const CU_PER_SWAP = 80_000;
const CU_BASE = 100_000;

export function optimizeCompute(
  hopCount: number,
  urgency: number,
): ComputeEstimate {
  const units = CU_BASE + hopCount * CU_PER_SWAP;
  const price = Math.round(10_000 * urgency); // microLamports per CU
  const totalCostLamports = Math.round(units * price / 1_000_000);

  return {
    units,
    price,
    totalCostLamports,
    optimized: true,
  };
}
