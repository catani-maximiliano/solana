import { RouteRaceResult } from "./types";

interface RouteOption {
  name: string;
  latencyMs: number;
  fillProb: number;
  expectedPnl: number;
}

export class RouteRacer {
  /** Simulate a race between route options. Returns the winner. */
  race(routes: RouteOption[]): RouteRaceResult {
    if (routes.length === 0) return { winner: "none", latencyMs: 0, fillProb: 0, expectedPnl: 0 };

    // Score each route: maximize (pnl * fillProb) / latency
    let best = routes[0];
    let bestScore = (best.expectedPnl * best.fillProb) / Math.max(1, best.latencyMs);

    for (let i = 1; i < routes.length; i++) {
      const r = routes[i];
      const score = (r.expectedPnl * r.fillProb) / Math.max(1, r.latencyMs);
      if (score > bestScore) { best = r; bestScore = score; }
    }

    return {
      winner: best.name,
      latencyMs: best.latencyMs,
      fillProb: best.fillProb,
      expectedPnl: best.expectedPnl,
    };
  }
}

export const routeRacer = new RouteRacer();
