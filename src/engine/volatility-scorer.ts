import { priceGraph, MarketSurfaceEntry } from "../graph";
import { logInfo, logSuccess } from "../logger";
import { SpreadAnalytics, SpreadMetrics } from "./spread-analytics";

const TOKEN_VOL_PROFILE: Record<string, { class: string; boost: number }> = {
  WIF:    { class: "MEME",       boost: 1.5 },
  BONK:   { class: "MEME",       boost: 1.5 },
  POPCAT: { class: "MEME",       boost: 1.5 },
  PYTH:   { class: "HIGH_VOL",   boost: 1.2 },
  JUP:    { class: "HIGH_VOL",   boost: 1.2 },
  RAY:    { class: "HIGH_VOL",   boost: 1.2 },
  mSOL:   { class: "LIQUID_STAKE", boost: 1.1 },
  jitoSOL:{ class: "LIQUID_STAKE", boost: 1.1 },
  SOL:    { class: "BASE",       boost: 1.0 },
  USDC:   { class: "STABLE",     boost: 0.5 },
  USDT:   { class: "STABLE",     boost: 0.5 },
};

const EXPLOSION_ZSCORE = 2.5;
const EXPLOSION_MIN_BPS = 3;

export interface VolatilityScore {
  pair: string;
  symbolA: string;
  symbolB: string;
  tokenClass: string;
  volatilityIndex: number;
  opportunityScore: number;
  dexDivergence: number;
  dexCount: number;
  spreadPersistence: number;
  feesBps: number;
  slippageBps: number;
  grossBps: number;
  netBps: number;
  isExplosion: boolean;
  metrics: SpreadMetrics;
  factors: {
    volComponent: number;
    persistComponent: number;
    dexComponent: number;
    feePenalty: number;
    slipPenalty: number;
  };
}

export class VolatilityScorer {
  private lastScores = new Map<string, VolatilityScore>();
  private explosionHistory = new Map<string, number>();

  rankPairs(
    spreadHistory: Map<string, number[]>,
    getSlippageBps: (pair: string) => number,
  ): VolatilityScore[] {
    const labels = priceGraph.getPairSurfaceLabels();
    const scores: VolatilityScore[] = [];

    for (const label of labels) {
      const surface = priceGraph.getMarketSurface(label);
      if (!surface || surface.validCount < 2) continue;

      const valid = surface.pools.filter((p) => p.health === "VALID" && p.price > 0).sort((a, b) => a.price - b.price);
      if (valid.length < 2) continue;

      const bestAsk = valid[0];
      const bestBid = valid[valid.length - 1];
      const grossBps = bestAsk.price > 0 ? ((bestBid.price - bestAsk.price) / bestAsk.price) * 10000 : 0;
      const feesBps = Math.round((bestAsk.fee + bestBid.fee) * 10) / 10;
      const netBps = grossBps - feesBps;

      const history = spreadHistory.get(label) || [];
      const metrics = SpreadAnalytics.computeMetrics(history, grossBps, feesBps);

      const [symA, symB] = label.split("/");
      const pA = TOKEN_VOL_PROFILE[symA];
      const pB = TOKEN_VOL_PROFILE[symB];
      const tokenClass = pA && pB
        ? (pA.boost > pB.boost ? pA.class : pB.class)
        : pA ? pA.class : pB ? pB.class : "UNKNOWN";

      const tokenBoost = Math.max(
        pA ? pA.boost : 0.8,
        pB ? pB.boost : 0.8,
      );

      const volatilityIndex = this.computeVolatilityIndex(metrics, tokenBoost);
      const dexDivergence = this.computeDexDivergence(valid);
      const slipBps = getSlippageBps(label);

      const factors = this.computeFactors(volatilityIndex, metrics, dexDivergence, feesBps, slipBps);
      const opportunityScore = this.computeOpportunityScore(factors);

      const isExplosion = this.detectExplosion(label, metrics, grossBps);

      scores.push({
        pair: label,
        symbolA: symA,
        symbolB: symB,
        tokenClass,
        volatilityIndex,
        opportunityScore,
        dexDivergence,
        dexCount: new Set(valid.map((p) => p.dex)).size,
        spreadPersistence: metrics.persistence,
        feesBps,
        slippageBps: slipBps,
        grossBps,
        netBps,
        isExplosion,
        metrics,
        factors,
      });
    }

    scores.sort((a, b) => b.opportunityScore - a.opportunityScore);

    for (const s of scores) {
      this.lastScores.set(s.pair, s);
    }

    return scores;
  }

  private computeVolatilityIndex(metrics: SpreadMetrics, tokenBoost: number): number {
    const stdNorm = Math.min(metrics.std, 20) / 20;
    const accelNorm = Math.min(Math.abs(metrics.acceleration), 10) / 10;
    const burstBonus = metrics.volatilityBurst ? 0.15 : 0;
    const zBonus = Math.min(Math.abs(metrics.zScore), 5) / 5 * 0.1;

    const raw = (stdNorm * 0.4 + accelNorm * 0.2 + burstBonus * 0.3 + zBonus * 0.1) * tokenBoost;
    return Math.min(100, Math.round(raw * 100));
  }

  private computeDexDivergence(pools: MarketSurfaceEntry[]): number {
    const prices = pools.map((p) => p.price);
    if (prices.length < 2) return 0;
    const mean = prices.reduce((s, v) => s + v, 0) / prices.length;
    if (mean <= 0) return 0;
    const maxDev = Math.max(...prices.map((p) => Math.abs(p - mean) / mean));
    const dexCount = new Set(pools.map((p) => p.dex)).size;
    const countBonus = Math.min(dexCount, 5) / 5;
    return Math.min(20, Math.round(maxDev * 10000 * 0.5 + countBonus * 12));
  }

  private computeFactors(
    volIdx: number,
    metrics: SpreadMetrics,
    dexDiv: number,
    feesBps: number,
    slipBps: number,
  ): VolatilityScore["factors"] {
    const volComponent = Math.min(40, volIdx * 0.4);
    const persistComponent = Math.min(20, metrics.persistence * 20);
    const dexComponent = Math.min(20, dexDiv);
    const feePenalty = Math.min(25, feesBps * 2.5);
    const slipPenalty = Math.min(25, slipBps * 2);
    return { volComponent, persistComponent, dexComponent, feePenalty, slipPenalty };
  }

  private computeOpportunityScore(factors: VolatilityScore["factors"]): number {
    const raw = factors.volComponent + factors.persistComponent + factors.dexComponent - factors.feePenalty - factors.slipPenalty;
    return Math.max(0, Math.min(100, Math.round(raw)));
  }

  private detectExplosion(pair: string, metrics: SpreadMetrics, currentGrossBps: number): boolean {
    const prev = this.lastScores.get(pair);
    const isBurst = metrics.volatilityBurst && Math.abs(metrics.zScore) > EXPLOSION_ZSCORE && currentGrossBps >= EXPLOSION_MIN_BPS;
    if (isBurst) {
      this.explosionHistory.set(pair, Date.now());
    }
    const recentExplosion = this.explosionHistory.get(pair);
    return isBurst || (recentExplosion ? Date.now() - recentExplosion < 60_000 : false);
  }

  getExplosions(): VolatilityScore[] {
    return Array.from(this.lastScores.values()).filter((s) => s.isExplosion);
  }

  printReport(scores: VolatilityScore[]): void {
    if (scores.length === 0) {
      logInfo(`  (no volatility data yet — need spread history)`);
      return;
    }

    const topN = scores.slice(0, 8);

    logSuccess("═══════════════════════════════════════════════════════════════════════════════════");
    logSuccess("📈 VOLATILITY-AWARE OPPORTUNITY RANKING");
    logSuccess("═══════════════════════════════════════════════════════════════════════════════════");

    for (let i = 0; i < topN.length; i++) {
      const s = topN[i];
      const explosionIcon = s.isExplosion ? "💥" : "";
      const classIcon = s.tokenClass === "MEME" ? "🎭" : s.tokenClass === "HIGH_VOL" ? "⚡" : s.tokenClass === "STABLE" ? "🛡️" : "";
      const netIcon = s.netBps > 0 ? "✅" : "❌";
      logInfo(`  #${i + 1}  ${s.pair} ${classIcon}${explosionIcon}  |  Score: ${s.opportunityScore}/100  |  Vol: ${s.volatilityIndex}  |  DexDiv: ${s.dexDivergence}  |  Persist: ${(s.spreadPersistence * 100).toFixed(0)}%`);
      logInfo(`        Gross: +${s.grossBps.toFixed(2)}bps  |  Net: ${netIcon} ${s.netBps.toFixed(2)}bps  |  Fees: ${s.feesBps}bps  |  Slip: ${s.slippageBps}bps  |  ${s.tokenClass}  |  DEXes: ${s.dexCount}`);
      logInfo(`        σ=${s.metrics.std.toFixed(2)}  accel=${s.metrics.acceleration.toFixed(2)}  burst=${s.metrics.volatilityBurst ? "Y" : "N"}  z=${s.metrics.zScore.toFixed(1)}`);
    }

    const explosions = scores.filter((s) => s.isExplosion);
    if (explosions.length > 0) {
      logInfo("");
      logInfo(`  💥 SPREAD EXPLOSIONS DETECTED:`);
      for (const e of explosions) {
        logInfo(`     ${e.pair}  |  Gross: +${e.grossBps.toFixed(2)}bps  |  σ: ${e.metrics.std.toFixed(2)}  |  z: ${e.metrics.zScore.toFixed(1)}  |  Score: ${e.opportunityScore}`);
      }
    }
    logSuccess("═══════════════════════════════════════════════════════════════════════════════════");
  }

  reset(): void {
    this.lastScores.clear();
    this.explosionHistory.clear();
  }
}

export const volatilityScorer = new VolatilityScorer();
