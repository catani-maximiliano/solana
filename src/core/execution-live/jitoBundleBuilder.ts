import { logInfo, logDebug } from "../../logger";

export interface BundleTx {
  instructions: any[];
  computeUnits: number;
  computeUnitPrice: number;
  tipLamports: number;
}

export class JitoBundleBuilder {
  /** Build a bundle with tip for Jito relay */
  build(instructions: any[], computeUnits: number, computeUnitPrice: number, tipLamports: number): BundleTx {
    return { instructions, computeUnits, computeUnitPrice, tipLamports };
  }

  /** Estimate total cost in SOL */
  estimateCost(computeUnits: number, computeUnitPrice: number, tipLamports: number): number {
    const cuCost = (computeUnits * computeUnitPrice) / 1_000_000_000;
    return cuCost + tipLamports / 1_000_000_000;
  }

  /** Create tip instruction for Jito */
  createTipInstruction(tipLamports: number): any {
    return { programId: "JitoTip111111111111111111111111111111111", data: Buffer.from([]), keys: [] };
  }
}

export const jitoBundleBuilder = new JitoBundleBuilder();
