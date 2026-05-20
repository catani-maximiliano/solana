import { TimingInput, TimingOutput } from "./types";
import { decideTiming } from "./holdVsFire";
import { timingProfiler } from "./timingProfiler";
import { logInfo } from "../../logger";

export class ExecutionTimingEngine {
  /** Analyze an opportunity and decide when to execute */
  analyze(input: TimingInput): TimingOutput {
    const output = decideTiming(
      input.pair,
      input.currentNetBps,
      input.spreadVelocity,
      input.spreadAcceleration,
      0, // decay simplified
      input.ageMs,
      input.lifetimeMs,
      input.toxicity,
      input.volatilityRegime,
    );

    timingProfiler.record(output.decision, input.currentNetBps, output.expectedEVAtExecution);
    return output;
  }

  /** Quick check: should we fire immediately? */
  shouldFireNow(input: TimingInput): boolean {
    return this.analyze(input).decision === "FIRE_NOW";
  }

  printStatus(): void {
    timingProfiler.printProfile();
  }

  reset(): void {
    timingProfiler.reset();
  }
}

export const timingEngine = new ExecutionTimingEngine();
