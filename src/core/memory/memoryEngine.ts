import { marketMemory } from "./marketMemory";
import { toxicPoolRegistry } from "./toxicPoolRegistry";
import { contextWindow } from "./contextWindow";
import { getAdaptiveContext, logAdaptiveContext } from "./adaptiveContextEngine";
import { logInfo, logSuccess } from "../../logger";

export class MemoryEngine {
  /** Record an outcome into market memory */
  recordOutcome(pair: string, pool: string, regimeName: string, survivalMs: number, decay: number, win: boolean, timing: string, fakeAlpha: boolean): void {
    marketMemory.record(pair, regimeName, survivalMs, decay, win, timing);
    toxicPoolRegistry.record(pool, fakeAlpha, survivalMs);
    logAdaptiveContext(pair, pool);
  }

  /** Get adaptive context for current decision */
  getContext(pair: string, pool: string) {
    return getAdaptiveContext(pair, pool);
  }

  /** Print memory dashboard */
  printReport(): void {
    const toxicCount = toxicPoolRegistry.getHighToxicityPools().length;
    const window = contextWindow.getWindow(5000);

    logSuccess(`━━━━━━━━ [MARKET MEMORY] ──────────`);
    logInfo(`Known toxic pools: ${toxicCount}`);
    logInfo(`Current regime: ${window.currentRegime}`);
    logInfo(`Recurring alpha windows: enabled`);
    logInfo(`Best timing: adaptive`);
    logInfo(`Best regime: adaptive`);
    logSuccess(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  reset(): void {
    marketMemory.reset();
    toxicPoolRegistry.reset();
    contextWindow.reset();
  }
}

export const memoryEngine = new MemoryEngine();
