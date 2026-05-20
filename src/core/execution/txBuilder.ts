import { TxBuildResult } from "./types";
import { logDebug } from "../../logger";

const BASE_TX_OVERHEAD = 128; // bytes
const SWAP_INSTRUCTION_SIZE = 180; // bytes per swap
const COMPUTE_BUDGET_INSTRUCTION = 40; // bytes

export class TxBuilder {
  /** Build a mock transaction for a swap route */
  build(hopCount: number, computeUnits: number): TxBuildResult {
    const start = performance.now();

    const instructionCount = 1 + hopCount; // compute budget + swaps
    const txSizeBytes = BASE_TX_OVERHEAD + instructionCount * SWAP_INSTRUCTION_SIZE + COMPUTE_BUDGET_INSTRUCTION;
    const serializationTimeMs = Math.round((performance.now() - start) * 100) / 100;

    return {
      txSizeBytes,
      instructionCount,
      computeUnits,
      serializationTimeMs,
    };
  }

  /** Estimate compute units for a route */
  estimateCompute(hopCount: number): number {
    return 100_000 + hopCount * 80_000; // base + per-hop
  }
}

export const txBuilder = new TxBuilder();
