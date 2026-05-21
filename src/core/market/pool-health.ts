import { poolQualityRegistry } from "../pools/poolQualityRegistry";

const STALE_THRESHOLD_MS = 10_000;
const MIN_UPDATES_PER_MIN = 5;
const MAX_STALE_RATE_PCT = 20;
const WINDOW_MS = 60_000;

interface PoolHealthData {
  poolAddress: string;
  dex: string;
  updates: number[];
  ages: number[];
  staleCount: number;
  totalCount: number;
  disabled: boolean;
  disabledReason?: string;
  lastUpdateTime: number;
  lastEnabledTime: number;
}

export type ExecutionGrade = "EXECUTION" | "DEGRADED" | "DEAD_POOL";

export interface PoolHealthReport {
  poolAddress: string;
  dex: string;
  updatesPerMin: number;
  avgAgeMs: number;
  staleRatePct: number;
  score: number;
  grade: ExecutionGrade;
  disabled: boolean;
  disabledReason?: string;
}

export class PoolHealthTracker {
  private data = new Map<string, PoolHealthData>();

  recordUpdate(poolAddress: string, dex: string, ageMs: number): void {
    const now = Date.now();
    let d = this.data.get(poolAddress);
    if (!d) {
      d = { poolAddress, dex, updates: [], ages: [], staleCount: 0, totalCount: 0, disabled: false, lastUpdateTime: now, lastEnabledTime: now };
      this.data.set(poolAddress, d);
    }

    d.updates.push(now);
    d.ages.push(ageMs);
    d.totalCount++;
    if (ageMs > STALE_THRESHOLD_MS) d.staleCount++;
    d.lastUpdateTime = now;

    const cutoff = now - WINDOW_MS;
    while (d.updates.length > 0 && d.updates[0] < cutoff) d.updates.shift();
    while (d.ages.length > 100) d.ages.shift();

    const report = this.computeReport(poolAddress);
    if (report && !d.disabled) {
      const shouldDisable = report.updatesPerMin < MIN_UPDATES_PER_MIN || report.staleRatePct > MAX_STALE_RATE_PCT;
      if (shouldDisable) {
        const reason = report.updatesPerMin < MIN_UPDATES_PER_MIN
          ? `low activity ${report.updatesPerMin.toFixed(1)}up/min < ${MIN_UPDATES_PER_MIN}`
          : `staleRate ${report.staleRatePct.toFixed(0)}% > ${MAX_STALE_RATE_PCT}%`;
        d.disabled = true;
        d.disabledReason = reason;
      }
    }
  }

  computeReport(poolAddress: string): PoolHealthReport | null {
    const d = this.data.get(poolAddress);
    if (!d) return null;

    const now = Date.now();
    const cutoff = now - WINDOW_MS;
    const recentUpdates = d.updates.filter(t => t >= cutoff).length;
    const recentAges = d.ages.slice(-recentUpdates);
    const avgAge = recentAges.length > 0 ? recentAges.reduce((a, b) => a + b, 0) / recentAges.length : 0;
    const staleRecent = recentAges.filter(a => a > STALE_THRESHOLD_MS).length;
    const staleRate = recentAges.length > 0 ? (staleRecent / recentAges.length) * 100 : 0;
    const updatesPerMin = (recentUpdates / WINDOW_MS) * 60_000;

    const ageScore = Math.max(0, 100 - (avgAge / STALE_THRESHOLD_MS) * 100);
    const freqScore = Math.min(100, (updatesPerMin / MIN_UPDATES_PER_MIN) * 100);
    const staleScore = 100 - staleRate;
    const score = Math.round((ageScore * 0.3 + freqScore * 0.4 + staleScore * 0.3));

    const grade: ExecutionGrade =
      updatesPerMin >= 30 && avgAge < 1000 && staleRate < 5 ? "EXECUTION"
      : updatesPerMin >= 5 ? "DEGRADED"
      : "DEAD_POOL";

    return {
      poolAddress,
      dex: d.dex,
      updatesPerMin: Math.round(updatesPerMin * 10) / 10,
      avgAgeMs: Math.round(avgAge),
      staleRatePct: Math.round(staleRate * 10) / 10,
      score,
      grade,
      disabled: d.disabled,
      disabledReason: d.disabledReason,
    };
  }

  isHealthy(poolAddress: string): boolean {
    const d = this.data.get(poolAddress);
    if (!d) return true;
    if (d.disabled) return false;
    const r = this.computeReport(poolAddress);
    if (!r) return true;
    return r.updatesPerMin >= MIN_UPDATES_PER_MIN && r.staleRatePct <= MAX_STALE_RATE_PCT;
  }

  isDisabled(poolAddress: string): boolean {
    return this.data.get(poolAddress)?.disabled ?? false;
  }

  getDisableReason(poolAddress: string): string | undefined {
    return this.data.get(poolAddress)?.disabledReason;
  }

  getReports(): PoolHealthReport[] {
    const reports: PoolHealthReport[] = [];
    for (const addr of this.data.keys()) {
      const r = this.computeReport(addr);
      if (r) reports.push(r);
    }
    return reports;
  }

  printSummary(): void {
    const reports = this.getReports();
    if (reports.length === 0) return;
    for (const r of reports) {
      console.log(`  [POOL_HEALTH] ${r.dex} ${r.poolAddress.substring(0, 8)}...`);
      console.log(`    updates=${r.updatesPerMin}/min  avgAge=${r.avgAgeMs}ms  stale=${r.staleRatePct}%  grade=${r.grade}`);
      if (r.disabled) {
        console.log(`  [POOL_DISABLED] ${r.poolAddress.substring(0, 8)}... disabled: ${r.disabledReason}`);
      }
    }
    poolQualityRegistry.printFakeAlphaDashboard();
  }

  reset(): void {
    this.data.clear();
  }
}

export const poolHealthTracker = new PoolHealthTracker();
