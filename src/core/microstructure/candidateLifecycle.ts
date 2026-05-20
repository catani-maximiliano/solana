import { CandidateLifecycle as LifecycleStateType } from "./types";
import { logDebug } from "../../logger";

interface LifecycleState {
  key: string;
  state: LifecycleStateType;
  enteredAt: number;
  peakSpread: number;
}

const STABLE_MS = 300;
const EXECUTABLE_MS = 800;
const MAX_AGE_MS = 10_000;

export class CandidateLifecycle {
  private states = new Map<string, LifecycleState>();

  /** Advance a candidate's lifecycle based on current spread and age */
  advance(key: string, spreadBps: number): LifecycleStateType {
    const now = Date.now();
    let state = this.states.get(key);

    if (!state) {
      state = { key, state: "NEW", enteredAt: now, peakSpread: spreadBps };
      this.states.set(key, state);
      logDebug(`[LIFECYCLE] ${key} → NEW`);
      return "NEW";
    }

    if (spreadBps > state.peakSpread) state.peakSpread = spreadBps;

    const age = now - state.enteredAt;

    let next: LifecycleStateType = state.state;

    switch (state.state) {
      case "NEW":
        if (age > 300) next = "STABLE";
        break;
      case "STABLE":
        if (age > 800) next = "EXECUTABLE";
        break;
      case "EXECUTABLE":
        if (spreadBps < state.peakSpread * 0.5) next = "DECAYING";
        break;
      case "DECAYING":
        if (age > 10000 || spreadBps <= 0) next = "DEAD";
        break;
      case "DEAD":
        break;
    }

    if (next !== state.state) {
      logDebug(`[LIFECYCLE] ${key}: ${state.state} → ${next}`);
      state.state = next;
    }

    return state.state;
  }

  /** Check if a candidate is in a promotable state */
  isPromotable(key: string): boolean {
    const state = this.states.get(key);
    return state?.state === "EXECUTABLE" || state?.state === "STABLE";
  }

  reset(): void {
    this.states.clear();
  }
}

export const candidateLifecycle = new CandidateLifecycle();
