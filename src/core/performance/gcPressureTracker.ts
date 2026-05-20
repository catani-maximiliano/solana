import { GCPressure } from "./types";
import { logWarning } from "../../logger";

export class GcPressureTracker {
  private youngGcTimes: number[] = [];
  private oldGcTimes: number[] = [];
  private allocationRates: number[] = [];

  record(youngGcMs: number, oldGcMs: number, allocationRateMBs: number): void {
    this.youngGcTimes.push(youngGcMs);
    this.oldGcTimes.push(oldGcMs);
    this.allocationRates.push(allocationRateMBs);
    if (this.youngGcTimes.length > 100) { this.youngGcTimes.shift(); this.oldGcTimes.shift(); this.allocationRates.shift(); }

    if (youngGcMs > 2 || oldGcMs > 5) {
      logWarning(`[GC] young=${youngGcMs.toFixed(1)}ms old=${oldGcMs.toFixed(1)}ms allocRate=${allocationRateMBs.toFixed(0)}MB/s — high GC pressure`);
    }
  }

  getPressure(): GCPressure {
    const avgYoung = this.youngGcTimes.length > 0 ? this.youngGcTimes.reduce((a, b) => a + b, 0) / this.youngGcTimes.length : 0;
    const avgOld = this.oldGcTimes.length > 0 ? this.oldGcTimes.reduce((a, b) => a + b, 0) / this.oldGcTimes.length : 0;
    const avgAlloc = this.allocationRates.length > 0 ? this.allocationRates.reduce((a, b) => a + b, 0) / this.allocationRates.length : 0;

    let pressure: "LOW" | "MEDIUM" | "HIGH" = "LOW";
    if (avgYoung > 3 || avgOld > 8 || avgAlloc > 50) pressure = "HIGH";
    else if (avgYoung > 1 || avgOld > 3 || avgAlloc > 20) pressure = "MEDIUM";

    return {
      youngGcMs: Math.round(avgYoung * 10) / 10,
      oldGcMs: Math.round(avgOld * 10) / 10,
      allocationRateMBs: Math.round(avgAlloc * 10) / 10,
      pressure,
    };
  }

  reset(): void { this.youngGcTimes = []; this.oldGcTimes = []; this.allocationRates = []; }
}

export const gcPressureTracker = new GcPressureTracker();
