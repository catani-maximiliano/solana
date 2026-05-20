import { SpreadMomentumType } from "./types";

export function classifyMomentum(
  velocity: number,    // bps/s
  acceleration: number, // bps/s²
  ageMs: number,
): SpreadMomentumType {
  if (ageMs < 100) return "EXPANDING";

  if (acceleration > 2) return "EXPANDING";
  if (velocity > 5) return "EXPANDING";

  if (acceleration < -3) return "COLLAPSING";
  if (velocity < -3) return "COLLAPSING";

  return "STABLE";
}
