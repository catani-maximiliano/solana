import { TrackedOpportunity, SurvivalAtLatency } from "./types";

export class OpportunityTracker {
  private opportunities = new Map<string, TrackedOpportunity>();

  /** Record a new opportunity */
  record(pair: string, dexes: string[], grossBps: number, netBps: number): void {
    const key = `${pair}:${dexes.join(":")}:${Date.now()}`;
    this.opportunities.set(key, {
      pair, dexes, detectedAt: Date.now(),
      grossBps, netBps, peakBps: grossBps,
      decayBps: 0, lifetimeMs: 0, diedAt: 0, survivedMs: 0,
      fillAtMs: [],
    });
  }

  /** Update an opportunity (decay tracking) */
  update(key: string, currentGross: number): void {
    const opp = this.opportunities.get(key);
    if (!opp) return;
    const elapsed = Date.now() - opp.detectedAt;
    opp.lifetimeMs = elapsed;
    if (currentGross > opp.peakBps) opp.peakBps = currentGross;
    opp.decayBps = (currentGross - opp.peakBps) / Math.max(1, elapsed);
  }

  /** Mark opportunity as dead */
  markDead(key: string): void {
    const opp = this.opportunities.get(key);
    if (!opp) return;
    opp.diedAt = Date.now();
    opp.survivedMs = opp.diedAt - opp.detectedAt;
  }

  /** Get survival at specific latencies */
  getSurvivalAtLatency(key: string): SurvivalAtLatency {
    const opp = this.opportunities.get(key);
    if (!opp) return { at50ms: false, at100ms: false, at250ms: false, at500ms: false, netAt50ms: 0, netAt250ms: 0, netAt500ms: 0 };
    const decay = opp.decayBps;
    const net50 = opp.netBps + decay * 50;
    const net250 = opp.netBps + decay * 250;
    const net500 = opp.netBps + decay * 500;
    return {
      at50ms: net50 > 0, at100ms: opp.netBps + decay * 100 > 0,
      at250ms: net250 > 0, at500ms: net500 > 0,
      netAt50ms: net50, netAt250ms: net250, netAt500ms: net500,
    };
  }

  get count(): number { return this.opportunities.size; }

  getAll(): TrackedOpportunity[] { return Array.from(this.opportunities.values()); }

  reset(): void { this.opportunities.clear(); }
}

export const opportunityTracker = new OpportunityTracker();
