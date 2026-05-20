import { ExecutionWindowType, SpreadMomentumType } from "./types";

export function classifyWindow(
  momentum: SpreadMomentumType,
  lifetimeMs: number,
  decay: number,
  toxicity: string,
  volatility: string,
): ExecutionWindowType {
  if (toxicity === "TOXIC") return "TOXIC_FAKE";
  if (toxicity === "RISKY" && volatility === "HIGH") return "TOXIC_FAKE";

  if (momentum === "COLLAPSING" && lifetimeMs < 200) return "INSTANT";
  if (momentum === "COLLAPSING") return "SHORT";

  if (momentum === "STABLE" && lifetimeMs > 500 && Math.abs(decay) < 2) return "MEDIUM";
  if (momentum === "STABLE" && lifetimeMs > 1000) return "SLOW";

  if (momentum === "STABLE" && Math.abs(decay) < 1) return "MEAN_REVERTING";

  if (momentum === "EXPANDING") return "MEDIUM";

  return "SHORT";
}
