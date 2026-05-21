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
}

export class PoolQualityRegistry {
  private data = new Map<string, PoolQualityData>();

  recordUpdate(poolAddress: string, dex: string, ageMs: number, slotDrift: number = 0): void {
    const now = Date.now();
    let d = this.data.get(poolAddress);
    if (!d) {
      d = { poolAddress, dex, updates: [], ages: [], staleRejects: 0, fakeAlphaInvolvements: 0, totalSpreadInvolvements: 0, lastUpdateAgeMs: ageMs, slotDrifts: [], disabled: false, executionGrade: false, lastGradeTime: 0 };
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

  computeMetrics(poolAddress: string): PoolQualityMetrics | null {
    const d = this.data.get(poolAddress);
    if (!d) return null;

    const now = Date.now();
    const cutoff = now - WINDOW_MS;
    const recentUpdates = d.updates.filter(t => t >= cutoff);
    const recentAges = d.ages.slice(-recentUpdates.length);
    const recentSlots = d.slotDrifts.slice(-50);

    // Update intervals
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

    // Score (0-1): freshness + frequency + slot health + fake alpha avoidance
    const ageScore = Math.max(0, 1 - (d.lastUpdateAgeMs / STALE_AGE_MS));
    const freqScore = Math.min(1, eventRate / 30); // 30 updates/min = 1.0
    const slotScore = Math.max(0, 1 - (avgSlotDrift / 50));
    const fakeAlphaScore = 1 - fakeAlphaRate;
    const score = ageScore * 0.25 + freqScore * 0.35 + slotScore * 0.15 + fakeAlphaScore * 0.25;

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

  getFakeAlphaDashboard(): string {
    const reports = this.getAllQualityReports();
    const fakeOnes = reports.filter(r => r.fakeSpreadInvolvement > 10);
    const execOnes = reports.filter(r => r.executionGrade);
    const disabledOnes = reports.filter(r => r.disabled);

    let out = "\n━━━━━━━━ [FAKE ALPHA] ━━━━━━━━\n";
    out += `Fake spreads rejected: ${reports.reduce((s, r) => s + r.staleRejects, 0)}\n`;

    if (fakeOnes.length > 0) {
      const worst = fakeOnes.reduce((a, b) => a.fakeSpreadInvolvement > b.fakeSpreadInvolvement ? a : b);
      out += `Worst offender:\n  ${worst.dex} ${worst.poolAddress.substring(0, 8)}...\n  stale=${(worst.lastUpdateAgeMs / 1000).toFixed(0)}s  fakeAlphaRate=${worst.fakeSpreadInvolvement}%\n`;
    }

    out += `\nClean execution pools:\n`;
    for (const r of execOnes) {
      out += `  ${r.dex} ${r.poolAddress.substring(0, 8)}...  score=${(r.score * 100).toFixed(0)}  rate=${r.eventRatePerMinute}/min\n`;
    }

    out += `\nDisabled pools:\n`;
    for (const r of disabledOnes) {
      out += `  ${r.dex} ${r.poolAddress.substring(0, 8)}...  ${r.disabledReason}\n`;
    }

    out += `\nExecution-grade universe: ${execOnes.length} pools\n`;
    out += "━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
    return out;
  }

  printFakeAlphaDashboard(): void {
    console.log(this.getFakeAlphaDashboard());
  }

  reset(): void {
    this.data.clear();
  }
}

export const poolQualityRegistry = new PoolQualityRegistry();
