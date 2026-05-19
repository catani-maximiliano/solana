export interface SpreadMetrics {
  mean: number;
  std: number;
  max: number;
  min: number;
  current: number;
  count: number;
  zScore: number;
  persistence: number;
  volatilityBurst: boolean;
  acceleration: number;
  samplesAboveThreshold: number;
}

export interface OpportunityScore {
  score: number;
  label: string;
  factors: {
    spreadQuality: number;
    volatilityBonus: number;
    persistenceBonus: number;
    liquidityFactor: number;
  };
}

const PERSISTENCE_WINDOW = 10;
const VOLATILITY_BURST_THRESHOLD = 2.0;
const ZSCORE_ANOMALY_THRESHOLD = 2.0;
const PERSISTENCE_THRESHOLD_BPS = 1.0;

export class SpreadAnalytics {
  static computeMetrics(history: number[], currentSpread: number, feesBps: number): SpreadMetrics {
    const count = history.length;
    if (count === 0) {
      return {
        mean: 0, std: 0, max: 0, min: 0, current: currentSpread,
        count: 0, zScore: 0, persistence: 0, volatilityBurst: false,
        acceleration: 0, samplesAboveThreshold: 0,
      };
    }

    const mean = history.reduce((s, v) => s + v, 0) / count;
    const variance = history.reduce((sq, v) => sq + (v - mean) ** 2, 0) / count;
    const std = Math.sqrt(variance);
    const max = Math.max(...history);
    const min = Math.min(...history);
    const zScore = std > 0 ? (currentSpread - mean) / std : 0;

    // Persistence: how many of the last N samples are above threshold
    const recent = history.slice(-PERSISTENCE_WINDOW);
    const aboveThreshold = recent.filter((v) => v >= PERSISTENCE_THRESHOLD_BPS).length;
    const persistence = PERSISTENCE_WINDOW > 0 ? aboveThreshold / PERSISTENCE_WINDOW : 0;

    // Volatility burst: recent std vs overall std
    const recentMean = recent.length > 0 ? recent.reduce((s, v) => s + v, 0) / recent.length : 0;
    const recentVariance = recent.length > 1
      ? recent.reduce((sq, v) => sq + (v - recentMean) ** 2, 0) / (recent.length - 1)
      : 0;
    const recentStd = Math.sqrt(recentVariance);
    const volatilityBurst = recentStd > VOLATILITY_BURST_THRESHOLD && recentStd > std * 1.5;

    // Spread acceleration: rate of change of spread (first derivative of recent trend)
    const acceleration = count >= 3
      ? (history[count - 1] - history[count - 3]) / 2
      : 0;

    // Samples above net threshold (after fees)
    const netThreshold = Math.max(PERSISTENCE_THRESHOLD_BPS, feesBps);
    const samplesAboveThreshold = history.filter((v) => v > netThreshold).length;

    return {
      mean, std, max, min, current: currentSpread, count,
      zScore, persistence, volatilityBurst,
      acceleration, samplesAboveThreshold,
    };
  }

  static computeScore(metrics: SpreadMetrics, feesBps: number, liquidity: number): OpportunityScore {
    const netBps = metrics.current - feesBps;
    const spreadQuality = netBps > 0 ? Math.min(1, netBps / 50) : 0;
    const volatilityBonus = metrics.volatilityBurst ? 0.3 : metrics.std > 1 ? 0.15 : 0;
    const persistenceBonus = metrics.persistence > 0.5 ? 0.2 : metrics.persistence > 0.2 ? 0.1 : 0;
    const liqFactor = Math.min(1, liquidity / 1_000_000);
    const liquidityFactor = liqFactor > 0.1 ? 0.1 : liqFactor > 0.01 ? 0.05 : 0;

    let score = spreadQuality + volatilityBonus + persistenceBonus + liquidityFactor;
    const isAnomaly = Math.abs(metrics.zScore) > ZSCORE_ANOMALY_THRESHOLD;
    if (isAnomaly && netBps > 0) score += 0.15;

    score = Math.min(1, Math.max(0, score));

    const level = score >= 0.6 ? "HIGH" : score >= 0.3 ? "MEDIUM" : "LOW";
    return {
      score,
      label: `SCORE#${Math.round(score * 100)} ${level}`,
      factors: { spreadQuality, volatilityBonus, persistenceBonus, liquidityFactor },
    };
  }

  static formatMetrics(metrics: SpreadMetrics): string {
    const burst = metrics.volatilityBurst ? " 🔥BURST" : "";
    const zTag = Math.abs(metrics.zScore) > ZSCORE_ANOMALY_THRESHOLD ? " ⚡ANOMALY" : "";
    return `μ=${metrics.mean.toFixed(2)} σ=${metrics.std.toFixed(2)} z=${metrics.zScore.toFixed(1)}${zTag}${burst} persist=${(metrics.persistence * 100).toFixed(0)}% accel=${metrics.acceleration.toFixed(2)}`;
  }
}
