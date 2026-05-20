import { ExecutionPlan } from "./types";
import { txBuilder } from "./txBuilder";
import { optimizeCompute } from "./computeOptimizer";
import { calculatePriorityFee } from "./priorityFeeEngine";
import { calculateSlippageLimit } from "./slippageController";
import { routeRacer } from "./routeRacer";
import { failureRecovery } from "./failureRecovery";
import { executionMetricsTracker } from "./executionMetrics";
import { executionState } from "./executionState";
import { executionProfiler } from "./executionProfiler";
import { logInfo, logSuccess, logWarning, logDebug } from "../../logger";

export interface ExecutionInput {
  pair: string;
  route: string;
  expectedPnlBps: number;
  hopCount: number;
  grossBps: number;
  persistenceScore: number;
  volatility: string;
  urgency: number;
  competition: number;
  sweepProbability: number;
  toxicity: string;
  expectedLatencyMs: number;
}

/**
 * Full execution planning pipeline.
 * Builds an ExecutionPlan with optimized parameters.
 * NEVER sends real transactions — always dry-run.
 */
export function planExecution(input: ExecutionInput): ExecutionPlan {
  executionProfiler.reset();
  executionProfiler.start();

  // 1. Compute optimization
  const compute = optimizeCompute(input.hopCount, input.urgency);
  executionProfiler.phase("compute");

  // 2. Priority fee
  const fee = calculatePriorityFee(input.expectedPnlBps, input.volatility, input.competition, input.urgency);
  executionProfiler.phase("fee");

  // 3. Slippage control
  const slippage = calculateSlippageLimit(input.grossBps, input.volatility, input.sweepProbability, input.toxicity, input.persistenceScore);
  executionProfiler.phase("slippage");

  // 4. Transaction build (mock)
  const tx = txBuilder.build(input.hopCount, compute.units);
  executionProfiler.phase("tx_build");

  // 5. Route race (mock)
  const raceResult = routeRacer.race([
    { name: input.route, latencyMs: input.expectedLatencyMs, fillProb: 0.7, expectedPnl: input.expectedPnlBps },
  ]);
  executionProfiler.phase("route_race");

  // 6. Decision
  const shouldSend = executionState.shouldSend();
  const priority = Math.round(input.expectedPnlBps * 5 + (1 - input.expectedLatencyMs / 2000) * 20);

  const plan: ExecutionPlan = {
    shouldSend: shouldSend && input.expectedPnlBps > 0,
    priority,
    expectedPnlBps: input.expectedPnlBps,
    computeUnits: compute.units,
    priorityFeeMicroLamports: fee.microLamports,
    slippageLimitBps: slippage.limitBps,
    estimatedLatencyMs: input.expectedLatencyMs,
    route: input.route,
    pair: input.pair,
    dexes: input.route.split("→"),
    dryRun: true,
  };

  executionProfiler.phase("complete");

  // Record metrics
  const profile = executionProfiler.getReport();
  executionMetricsTracker.recordBuild(profile.phases[0]?.ms || 0);
  executionMetricsTracker.recordSerialization(tx.serializationTimeMs);
  executionMetricsTracker.recordRoute(input.expectedLatencyMs);
  executionMetricsTracker.recordTotal(profile.totalMs);

  executionState.recordPlan(plan);

  // Log
  logInfo(`[EXECUTION] ${input.pair} route=${input.route.substring(0, 30)}...`);
  logInfo(`  priorityFee=${fee.microLamports} CU=${compute.units} slippage=${slippage.limitBps}bps`);
  logInfo(`  build=${profile.totalMs}ms send=${plan.shouldSend} (dry-run)`);

  if (plan.shouldSend) {
    logSuccess(`[EXECUTION] ✅ WOULD EXECUTE: ${input.pair} expected=+${input.expectedPnlBps.toFixed(1)}bps (dry-run)`);
  }

  return plan;
}

export function logExecutionMetrics(): void {
  const m = executionMetricsTracker.getAverage();
  logDebug(`[EXEC] metrics: build=${m.buildLatencyMs}ms serial=${m.serializationLatencyMs}ms route=${m.routeLatencyMs}ms total=${m.totalPlanMs}ms`);
}

export { executionState, executionMetricsTracker, failureRecovery, txBuilder, routeRacer };
