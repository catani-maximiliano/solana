import { ExecutionPlan, BundleTx } from "./ExecutionTypes";
import { transactionComposer } from "./TransactionComposer";
import { logInfo, logDebug } from "../logger";

const COMPUTE_UNITS_PER_SWAP = 400_000;

export class BundleBuilder {
  build(plan: ExecutionPlan): BundleTx | null {
    if (!plan.bundleReady) {
      logDebug(`BundleBuilder: bundle NOT ready — ${plan.route} freshness=${plan.freshness} confidence=${(plan.confidence * 100).toFixed(0)}% crossDex=${plan.crossDex}`);
      return null;
    }

    const tx = transactionComposer.buildBundleTx(
      plan.swaps,
      plan.priorityFeeMicroLamports,
      plan.estimatedTipLamports,
    );

    logInfo(`BundleBuilder: ✅ bundle ready for ${plan.route}`);
    logInfo(`  Swaps: ${tx.instructions.length} | CU: ${tx.computeUnits} | CU Price: ${tx.computeUnitPrice} μSOL`);
    logInfo(`  Tip: ${tx.tipLamports} lamports | Estim. Cost: ${((tx.tipLamports + tx.computeUnitPrice * tx.computeUnits / 1_000_000) * 1e-9).toFixed(6)} SOL`);

    return tx;
  }

  estimateCost(plan: ExecutionPlan): number {
    const cuCost = (plan.priorityFeeMicroLamports * COMPUTE_UNITS_PER_SWAP * plan.swaps.length) / 1_000_000;
    return cuCost + plan.estimatedTipLamports;
  }
}

export const bundleBuilder = new BundleBuilder();
