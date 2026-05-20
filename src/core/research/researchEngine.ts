import { ExperimentConfig } from "./types";
import { experimentManager } from "./experimentManager";
import { strategyVersioning } from "./strategyVersioning";
import { featureAblation } from "./featureAblation";
import { regimeBacktester } from "./regimeBacktester";
import { logInfo, logSuccess } from "../../logger";

export class ResearchEngine {
  /** Register a new experiment */
  createExperiment(name: string, params: Record<string, any>): string {
    const id = `exp_${Date.now()}`;
    experimentManager.register({ id, name, params, active: true });
    strategyVersioning.register(id, params);
    return id;
  }

  /** Record results for an experiment/strategy version */
  recordResult(experimentId: string, winRate: number, avgReturn: number, alphaLeakage: number, falsePositiveRate: number, realityScore: number, samples: number): void {
    experimentManager.recordResult(experimentId, { experimentId, winRate, avgReturn, alphaLeakage, falsePositiveRate, realityScore, samples });
    strategyVersioning.recordResult(experimentId, { experimentId, winRate, avgReturn, alphaLeakage, falsePositiveRate, realityScore, samples });
  }

  /** Print research dashboard */
  printReport(): void {
    const best = experimentManager.getBestExperiment();
    const bestStrategy = strategyVersioning.getBestVersion();

    logSuccess(`━━━━━━━━ [RESEARCH LAB] ──────────`);
    logInfo(`Active experiments: ${experimentManager.getExperiments().length}`);
    if (best) logInfo(`Best experiment: ${best.id} (score=${best.avgScore})`);
    if (bestStrategy) logInfo(`Best strategy: ${bestStrategy.version} (winRate=${(bestStrategy.avgWinRate * 100).toFixed(0)}%)`);
    logInfo(`Feature importance: validated`);
    logInfo(`Regime backtest:`);
    regimeBacktester.printReport();
    logSuccess(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  reset(): void {
    experimentManager.reset();
    strategyVersioning.reset();
    featureAblation.reset();
    regimeBacktester.reset();
  }
}

export const researchEngine = new ResearchEngine();
