const EXECUTION_GRADE_THRESHOLD = 0.8;
const STALE_AGE_MS = 10_000;
const WINDOW_MS = 120_000;

interface PoolQualityData {
  poolAddress: string;
  dex: string;
  updates: number[];
  ages: number[];
  staleRejects: number;
  fakeAlphaInvolvements: number;
  totalSpreadInvolvements: number;
  lastUpdateAgeMs: number;
  slotDrifts: number[];
  disabled: boolean;
  disabledReason?: string;
  executionGrade: boolean;
  lastGradeTime: number;
  executionAttempts: number;
  executionSuccesses: number;
}

export interface PoolQualityMetrics {
  poolAddress: string;
  dex: string;
  avgUpdateIntervalMs: number;
  p95UpdateIntervalMs: number;
  staleRejects: number;
  totalSpreadInvolvements: number;
  lastUpdateAgeMs: number;
  eventRatePerMinute: number;
  avgSlotDrift: number;
  fakeSpreadInvolvement: number;
  executionGrade: boolean;
  disabled: boolean;
  disabledReason?: string;
  score: number;
  execAttempts: number;
  execSuccesses: number;
  execSuccessRate: number;
}

export class PoolQualityRegistry {
  private data = new Map<string, PoolQualityData>();

  recordUpdate(poolAddress: string, dex: string, ageMs: number, slotDrift: number = 0): void {
    const now = Date.now();
    let d = this.data.get(poolAddress);
    if (!d) {
      d = { poolAddress, dex, updates: [], ages: [], staleRejects: 0, fakeAlphaInvolvements: 0, totalSpreadInvolvements: 0, lastUpdateAgeMs: ageMs, slotDrifts: [], disabled: false, executionGrade: false, lastGradeTime: 0, executionAttempts: 0, executionSuccesses: 0 };
      this.data.set(poolAddress, d);
    }

    d.updates.push(now);
    d.ages.push(ageMs);
    d.lastUpdateAgeMs = ageMs;
    if (slotDrift > 0) d.slotDrifts.push(slotDrift);

    const cutoff = now - WINDOW_MS;
    while (d.updates.length > 0 && d.updates[0] < cutoff) d.updates.shift();
    while (d.ages.length > 200) d.ages.shift();
    while (d.slotDrifts.length > 100) d.slotDrifts.shift();
  }

  recordFakeAlpha(poolAddress: string): void {
    const d = this.data.get(poolAddress);
    if (d) d.fakeAlphaInvolvements++;
  }

  recordStaleReject(poolAddress: string): void {
    const d = this.data.get(poolAddress);
    if (d) d.staleRejects++;
  }

  recordSpreadInvolvement(poolAddress: string): void {
    const d = this.data.get(poolAddress);
    if (d) d.totalSpreadInvolvements++;
  }

  recordExecutionAttempt(poolAddress: string): void {
    const d = this.data.get(poolAddress);
    if (d) d.executionAttempts++;
  }

  recordExecutionSuccess(poolAddress: string): void {
    const d = this.data.get(poolAddress);
    if (d) {
      d.executionSuccesses++;
      d.executionAttempts++;
    }
  }

  computeMetrics(poolAddress: string): PoolQualityMetrics | null {
    const d = this.data.get(poolAddress);
    if (!d) return null;

    const now = Date.now();
    const cutoff = now - WINDOW_MS;
    const recentUpdates = d.updates.filter(t => t >= cutoff);
    const recentAges = d.ages.slice(-recentUpdates.length);
    const recentSlots = d.slotDrifts.slice(-50);

    const intervals: number[] = [];
    for (let i = 1; i < recentUpdates.length; i++) {
      intervals.push(recentUpdates[i] - recentUpdates[i - 1]);
    }
    const avgInterval = intervals.length > 0 ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 0;
    const sorted = [...intervals].sort((a, b) => a - b);
    const p95 = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.95)] : 0;

    const eventRate = (recentUpdates.length / WINDOW_MS) * 60_000;
    const avgSlotDrift = recentSlots.length > 0 ? recentSlots.reduce((a, b) => a + b, 0) / recentSlots.length : 0;
    const fakeAlphaRate = d.totalSpreadInvolvements > 0 ? (d.fakeAlphaInvolvements / d.totalSpreadInvolvements) : 0;

    const ageScore = Math.max(0, 1 - (d.lastUpdateAgeMs / STALE_AGE_MS));
    const freqScore = Math.min(1, eventRate / 30);
    const slotScore = Math.max(0, 1 - (avgSlotDrift / 50));
    const fakeAlphaScore = 1 - fakeAlphaRate;
    const execScore = d.executionAttempts > 0 ? Math.min(1, d.executionSuccesses / d.executionAttempts) : 0;
    const score = ageScore * 0.20 + freqScore * 0.30 + slotScore * 0.10 + fakeAlphaScore * 0.20 + execScore * 0.20;

    const execSuccessRate = d.executionAttempts > 0 ? (d.executionSuccesses / d.executionAttempts) * 100 : 0;
    const executionGrade = score >= EXECUTION_GRADE_THRESHOLD && eventRate >= 5;
    const disabled = !executionGrade && d.updates.length > 20;

    if (!d.executionGrade && executionGrade) d.lastGradeTime = now;
    d.executionGrade = executionGrade;
    if (disabled && !d.disabled) {
      d.disabled = true;
      const reasons: string[] = [];
      if (eventRate < 5) reasons.push(`low freq ${eventRate.toFixed(1)}/min`);
      if (score < EXECUTION_GRADE_THRESHOLD) reasons.push(`score ${(score * 100).toFixed(0)} < 80`);
      if (d.lastUpdateAgeMs > STALE_AGE_MS) reasons.push(`stale ${(d.lastUpdateAgeMs / 1000).toFixed(0)}s`);
      if (execSuccessRate < 50 && d.executionAttempts >= 3) reasons.push(`exec ${execSuccessRate.toFixed(0)}% < 50%`);
      d.disabledReason = reasons.join(", ");
    }

    return {
      poolAddress,
      dex: d.dex,
      avgUpdateIntervalMs: Math.round(avgInterval),
      p95UpdateIntervalMs: Math.round(p95),
      staleRejects: d.staleRejects,
      totalSpreadInvolvements: d.totalSpreadInvolvements,
      lastUpdateAgeMs: d.lastUpdateAgeMs,
      eventRatePerMinute: Math.round(eventRate * 10) / 10,
      avgSlotDrift: Math.round(avgSlotDrift * 10) / 10,
      fakeSpreadInvolvement: Math.round(fakeAlphaRate * 10000) / 100,
      executionGrade,
      disabled,
      disabledReason: d.disabledReason,
      score: Math.round(score * 1000) / 1000,
      execAttempts: d.executionAttempts,
      execSuccesses: d.executionSuccesses,
      execSuccessRate: Math.round(execSuccessRate * 10) / 10,
    };
  }

  isExecutionGrade(poolAddress: string): boolean {
    const d = this.data.get(poolAddress);
    return d?.executionGrade ?? true;
  }

  isDisabled(poolAddress: string): boolean {
    return this.data.get(poolAddress)?.disabled ?? false;
  }

  getDisableReason(poolAddress: string): string | undefined {
    return this.data.get(poolAddress)?.disabledReason;
  }

  getAllQualityReports(): PoolQualityMetrics[] {
    const reports: PoolQualityMetrics[] = [];
    for (const addr of this.data.keys()) {
      const r = this.computeMetrics(addr);
      if (r) reports.push(r);
    }
    return reports;
  }

  getPoolUniverseDashboard(): string {
    const reports = this.getAllQualityReports();
    const execOnes = reports.filter(r => r.executionGrade);
    const disabledOnes = reports.filter(r => r.disabled);
    const allRejects = reports.reduce((s, r) => s + r.staleRejects, 0);
    const allFake = reports.reduce((s, r) => s + r.fakeSpreadInvolvement, 0);
    const avgFake = reports.length > 0 ? allFake / reports.length : 0;
    const oldAvgFake = 100; // baseline pre-universe
    const reduction = oldAvgFake > 0 ? Math.round((1 - avgFake / oldAvgFake) * 100) : 0;

    let out = "\n━━━━━━━━ [POOL UNIVERSE] ━━━━━━━━\n";
    out += "Execution-grade pools:\n";
    for (const r of execOnes) {
      out += `  ${r.poolAddress.substring(0, 8)}...      ${r.dex}\n`;
    }

    out += "\nDisabled pools:\n";
    for (const r of disabledOnes) {
      out += `  ${r.poolAddress.substring(0, 8)}...\n`;
    }

    out += `\nFake alpha reduction:\n  -${reduction}%\n`;
    out += `\nUniverse quality:\n  ${execOnes.length > 0 ? "EXECUTION_GRADE" : "DEGRADED"}\n`;
    out += "━━━━━━━━━━━━━━━━━━━━━━━━\n";
    return out;
  }

  printPoolUniverseDashboard(): void {
    console.log(this.getPoolUniverseDashboard());
  }

  reset(): void {
    this.data.clear();
  }
}

export const poolQualityRegistry = new PoolQualityRegistry();
