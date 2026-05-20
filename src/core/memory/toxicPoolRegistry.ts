import { PoolToxicityRecord } from "./types";
import { logWarning } from "../../logger";

export class ToxicPoolRegistry {
  private pools = new Map<string, PoolToxicityRecord>();

  record(pool: string, fakeAlpha: boolean, survivalMs: number): void {
    const rec = this.pools.get(pool) || { pool, toxicity: "LOW", fakeAlphaRate: 0, survivalP50: 500, observationCount: 0 };
    rec.observationCount++;
    rec.survivalP50 = (rec.survivalP50 * (rec.observationCount - 1) + survivalMs) / rec.observationCount;

    if (fakeAlpha) rec.fakeAlphaRate = (rec.fakeAlphaRate * (rec.observationCount - 1) + 1) / rec.observationCount;

    if (rec.fakeAlphaRate > 0.5 && rec.survivalP50 < 200) rec.toxicity = "HIGH";
    else if (rec.fakeAlphaRate > 0.2 || rec.survivalP50 < 400) rec.toxicity = "MEDIUM";
    else rec.toxicity = "LOW";

    if (rec.toxicity === "HIGH") logWarning(`[TOXIC_POOL] ${pool.substring(0, 8)}... fakeAlphaRate=${(rec.fakeAlphaRate * 100).toFixed(0)}% survivalP50=${Math.round(rec.survivalP50)}ms`);

    this.pools.set(pool, rec);
  }

  getToxicity(pool: string): "LOW" | "MEDIUM" | "HIGH" {
    return this.pools.get(pool)?.toxicity || "LOW";
  }

  getHighToxicityPools(): string[] {
    return Array.from(this.pools.values()).filter(p => p.toxicity === "HIGH").map(p => p.pool);
  }

  reset(): void { this.pools.clear(); }
}

export const toxicPoolRegistry = new ToxicPoolRegistry();
