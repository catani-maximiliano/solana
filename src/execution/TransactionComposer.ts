import { SwapInstruction, BundleTx, ExecutionPlan } from "./ExecutionTypes";

interface MultiHopStep {
  poolAddress: string;
  dex: string;
  fromToken: string;
  toToken: string;
  fromSymbol: string;
  toSymbol: string;
  price: number;
  inputAmount: number;
  outputAmount: number;
  feeBps: number;
  slippageBps: number;
}

export class TransactionComposer {
  composeSwapInstructions(
    route: string,
    type: ExecutionPlan["type"],
    steps: MultiHopStep[],
    inputUsd: number,
    netBps: number,
    solUsd: number,
  ): SwapInstruction[] {
    return steps.map((s) => ({
      poolAddress: s.poolAddress,
      dex: s.dex,
      fromMint: s.fromToken,
      toMint: s.toToken,
      fromSymbol: s.fromSymbol,
      toSymbol: s.toSymbol,
      inputAmount: s.inputAmount,
      outputAmount: s.outputAmount,
      minimumOutputAmount: s.outputAmount * (1 - 0.005), // 0.5% slippage tolerance
      slippageBps: s.slippageBps,
      feeBps: s.feeBps,
    }));
  }

  buildBundleTx(
    instructions: SwapInstruction[],
    priorityFeeMicroLamports: number,
    tipLamports: number,
  ): BundleTx {
    return {
      instructions,
      computeUnits: 400_000 * instructions.length,
      computeUnitPrice: priorityFeeMicroLamports,
      tipLamports,
      validAges: [],
    };
  }

  buildExecutionPlan(
    route: string,
    type: ExecutionPlan["type"],
    inputUsd: number,
    expectedOutputUsd: number,
    swaps: SwapInstruction[],
    netBps: number,
    feesBps: number,
    slippageBps: number,
    priorityFeeMicroLamports: number,
    tipLamports: number,
    slotDelta: number,
    ageDeltaMs: number,
    confidence: number,
    crossDex: boolean,
    qualityScore: number,
  ): ExecutionPlan {
    const profitUsd = expectedOutputUsd - inputUsd;
    const totalCostLamports = (priorityFeeMicroLamports * 400_000 * swaps.length) / 1_000_000 + tipLamports;
    const totalCostUsd = totalCostLamports * 1e-9 * (expectedOutputUsd / inputUsd || 84);

    const freshnessLevel = (() => {
      if (ageDeltaMs < 500 && slotDelta < 2) return "GOOD" as const;
      if (ageDeltaMs < 1500 && slotDelta < 5) return "FAIR" as const;
      if (ageDeltaMs < 5000 && slotDelta < 20) return "STALE" as const;
      return "INVALID" as const;
    })();

    return {
      id: `${type}:${route}:${Date.now()}`,
      route,
      type,
      inputUsd,
      expectedOutputUsd,
      profitUsd: profitUsd - totalCostUsd,
      netBps,
      feesBps,
      slippageBps,
      swaps,
      priorityFeeMicroLamports,
      estimatedTipLamports: tipLamports,
      totalCostLamports,
      qualityScore,
      bundleReady: freshnessLevel === "GOOD" && crossDex && confidence > 0.85,
      freshness: freshnessLevel,
      slotDelta,
      ageDeltaMs,
      confidence,
      crossDex,
    };
  }

  reset(): void {}
}

export const transactionComposer = new TransactionComposer();
