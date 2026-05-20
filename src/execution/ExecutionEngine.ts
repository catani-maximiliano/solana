import { priceGraph } from "../graph";
import { MarketSurfaceEntry } from "../graph";
import { ExecutionPlan, SwapInstruction } from "./ExecutionTypes";
import { priorityFeeManager } from "./PriorityFeeManager";
import { tipEstimator } from "./TipEstimator";
import { transactionComposer } from "./TransactionComposer";
import { bundleBuilder } from "./BundleBuilder";
import { logInfo, logSuccess, logDebug } from "../logger";

const MIN_NET_BPS = 15;
const MAX_AGE_DELTA_MS = 1000;
const MAX_SLOT_DELTA = 3;
const MIN_CONFIDENCE = 0.85;
const MIN_LIQUIDITY_USD = 1_000_000;

// Re-export types for convenience
export { ExecutionPlan } from "./ExecutionTypes";

interface ExecutableCandidate {
  route: string;
  type: ExecutionPlan["type"];
  netBps: number;
  profitUsd: number;
  inputUsd: number;
  steps: Array<{
    fromToken: string;
    toToken: string;
    fromSymbol: string;
    toSymbol: string;
    poolAddress: string;
    dex: string;
    price: number;
    inputAmount: number;
    outputAmount: number;
    feeBps: number;
    slippageBps: number;
  }>;
}

export class ExecutionEngine {
  private candidates: ExecutableCandidate[] = [];
  private executionPlans: ExecutionPlan[] = [];

  /** Submit a candidate for potential execution */
  submitCandidate(candidate: ExecutableCandidate): void {
    this.candidates.push(candidate);
  }

  /** Evaluate all candidates and generate execution plans for viable ones */
  evaluateAll(solUsd: number): ExecutionPlan[] {
    const plans: ExecutionPlan[] = [];
    const now = Date.now();

    for (const c of this.candidates) {
      const plan = this.evaluateCandidate(c, solUsd, now);
      if (plan) plans.push(plan);
    }

    this.executionPlans = plans.sort((a, b) => b.qualityScore - a.qualityScore);
    this.candidates = [];
    return this.executionPlans;
  }

  private evaluateCandidate(c: ExecutableCandidate, solUsd: number, now: number): ExecutionPlan | null {
    // ── Strict execution filters ──
    if (c.netBps < MIN_NET_BPS) {
      logDebug(`ExecEngine: REJECT ${c.route} — net ${c.netBps.toFixed(1)}bps < ${MIN_NET_BPS}bps`);
      return null;
    }

    // Check freshness for all steps
    let maxAgeDelta = 0;
    let maxSlotDelta = 0;
    let crossDex = false;
    let minLiq = Infinity;
    const dexes = new Set<string>();

    for (const step of c.steps) {
      dexes.add(step.dex);
      const edge = priceGraph.getDirectPrice(step.fromToken, step.toToken);
      if (edge) {
        const ageDelta = now - edge.timestamp;
        if (ageDelta > maxAgeDelta) maxAgeDelta = ageDelta;
        const slotDelta = edge.slot > 0 ? Math.abs(edge.slot - (c.steps[0] as any).slot || 0) : 0;
        // Simplified: just check edge age
      }
    }

    // Simple freshness: largest edge age in the route
    maxAgeDelta = 0;
    for (const step of c.steps) {
      const edge = priceGraph.getDirectPrice(step.fromToken, step.toToken);
      if (edge) {
        const age = now - edge.timestamp;
        if (age > maxAgeDelta) maxAgeDelta = age;
        if (edge.slot > 0) {
          const sd = Math.abs(edge.slot - (c.steps[0] as any).lastSlot || 0);
          // simplified
        }
      }
    }

    crossDex = dexes.size > 1;
    maxSlotDelta = 0;

    for (const step of c.steps) {
      const edge = priceGraph.getDirectPrice(step.fromToken, step.toToken);
      if (edge) {
        const age = now - edge.timestamp;
        if (age > maxAgeDelta) maxAgeDelta = age;
      }
    }

    // Freshness gate
    if (maxAgeDelta > MAX_AGE_DELTA_MS) {
      logDebug(`ExecEngine: REJECT ${c.route} — age ${(maxAgeDelta/1000).toFixed(1)}s > ${MAX_AGE_DELTA_MS/1000}s`);
      return null;
    }

    // Cross-DEX gate
    if (!crossDex) {
      logDebug(`ExecEngine: REJECT ${c.route} — same-dex only (${[...dexes].join(",")})`);
      return null;
    }

    // Compute quality score
    const ageScore = Math.max(0, 1 - maxAgeDelta / 5000);
    const crossBonus = crossDex ? 0.2 : 0;
    const liqScore = minLiq > MIN_LIQUIDITY_USD ? 0.1 : 0;
    const netScore = Math.min(0.3, c.netBps / 100);
    const qualityScore = Math.min(1, ageScore * 0.3 + crossBonus + liqScore + netScore * 0.4 + 0.1);

    const confidence = Math.min(1, qualityScore * 0.8 + 0.2);
    const priorityFee = priorityFeeManager.estimatePriorityFee(c.netBps, maxSlotDelta, minLiq);
    const tipInfo = tipEstimator.estimateTip(c.netBps, c.profitUsd, confidence, minLiq);

    // Build execution plan
    const swaps: SwapInstruction[] = c.steps.map((s) => ({
      poolAddress: s.poolAddress,
      dex: s.dex,
      fromMint: s.fromToken,
      toMint: s.toToken,
      fromSymbol: s.fromSymbol,
      toSymbol: s.toSymbol,
      inputAmount: s.inputAmount,
      outputAmount: s.outputAmount,
      minimumOutputAmount: s.outputAmount * 0.995,
      slippageBps: s.slippageBps,
      feeBps: s.feeBps,
    }));

    const plan = transactionComposer.buildExecutionPlan(
      c.route,
      c.type,
      c.inputUsd,
      c.inputUsd + c.profitUsd,
      swaps,
      c.netBps,
      0, // fees - simplified
      0, // slippage - simplified
      priorityFee.microLamports,
      tipInfo.lamports,
      maxSlotDelta,
      maxAgeDelta,
      confidence,
      crossDex,
      qualityScore,
    );

    this.logExecutionPlan(plan);

    return plan;
  }

  private logExecutionPlan(plan: ExecutionPlan): void {
    logInfo("");
    logSuccess(`━━━━━━━━ EXECUTION PLAN ─${plan.id.slice(-4)}━━━━━━━━`);
    logInfo(`Pair: ${plan.route}`);
    logInfo(`Expected Net: +${plan.netBps.toFixed(1)}bps | Profit: $${plan.profitUsd.toFixed(4)}`);
    logInfo(`Freshness: ${plan.freshness} | Slot Δ: ${plan.slotDelta} | Age Δ: ${(plan.ageDeltaMs/1000).toFixed(1)}s`);
    logInfo(`Priority Fee: ${plan.priorityFeeMicroLamports} μSOL | Est. Tip: ${plan.estimatedTipLamports} lamports`);
    logInfo(`Execution Quality: ${(plan.qualityScore * 100).toFixed(0)}/100`);
    logInfo(`Bundle Ready: ${plan.bundleReady ? "YES" : "NO"}`);
    logInfo(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  reset(): void {
    this.candidates = [];
    this.executionPlans = [];
  }
}

export const executionEngine = new ExecutionEngine();
