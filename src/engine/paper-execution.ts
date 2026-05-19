import { priceGraph } from "../graph";
import { profitLedger } from "./profit-ledger";
import { logInfo, logSuccess, logDebug } from "../logger";
import * as fs from "fs";
import * as path from "path";

interface PendingExecution {
  route: string;
  steps: Array<{ from: string; to: string }>;
  detectedAt: number;
  promotedAt: number;
  expectedNetBps: number;
  expectedProfitUsd: number;
  inputUsd: number;
  firstEdgeMint: string;
  lastEdgeMint: string;
}

interface ExecutionReplay {
  route: string;
  detectedNetBps: number;
  replayed: Array<{ delayMs: number; netBps: number; profitUsd: number }>;
}

interface RouteStats {
  route: string;
  detectionCount: number;
  promotedCount: number;
  survived500ms: number;
  survived1s: number;
  survived2s: number;
  survived5s: number;
}

export class PaperExecutionEngine {
  private pending: PendingExecution[] = [];
  private replays: ExecutionReplay[] = [];
  private routeStats = new Map<string, RouteStats>();
  private checkTimer: ReturnType<typeof setInterval> | null = null;
  private csvPath = "";

  constructor() {
    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    this.csvPath = path.join(dataDir, "paper_execution_results.csv");
    // Write CSV header
    fs.writeFileSync(this.csvPath, "datetime_utc,route,delay_ms,detected_net_bps,realized_net_bps,detected_profit_usd,realized_profit_usd\n");
  }

  /** Register an executable route for paper replay */
  registerExecutable(
    route: string,
    steps: Array<{ from: string; to: string }>,
    netBps: number,
    profitUsd: number,
    inputUsd: number,
    firstEdgeMint: string,
    lastEdgeMint: string,
  ): void {
    const now = Date.now();
    this.pending.push({
      route,
      steps,
      detectedAt: now,
      promotedAt: now,
      expectedNetBps: netBps,
      expectedProfitUsd: profitUsd,
      inputUsd,
      firstEdgeMint,
      lastEdgeMint,
    });

    // Update route stats
    const existing = this.routeStats.get(route) || { route, detectionCount: 0, promotedCount: 0, survived500ms: 0, survived1s: 0, survived2s: 0, survived5s: 0 };
    existing.detectionCount++;
    existing.promotedCount++;
    this.routeStats.set(route, existing);

    // Start replay timer on first registration
    if (!this.checkTimer) {
      this.checkTimer = setInterval(() => this.replayAll(), 1000);
    }
  }

  /** Replay all pending executions, checking if they still survive */
  private replayAll(): void {
    const now = Date.now();
    const stillPending: PendingExecution[] = [];

    for (const exec of this.pending) {
      const elapsed = now - exec.promotedAt;

      // Simulate the route again using current market state
      const realized = this.simulateRoute(exec);
      const realizedNetBps = realized?.netBps ?? -999;
      const realizedProfitUsd = realized?.profitUsd ?? 0;

      // Record replay at checkpoints
      const checkpoints = [500, 1000, 2000, 5000];
      for (const cp of checkpoints) {
        if (elapsed >= cp && elapsed - cp < 1000) {
          // First time we cross this checkpoint
          const record = this.replays.find(r => r.route === exec.route);
          if (record) {
            record.replayed.push({ delayMs: cp, netBps: realizedNetBps, profitUsd: realizedProfitUsd });
          } else {
            this.replays.push({
              route: exec.route,
              detectedNetBps: exec.expectedNetBps,
              replayed: [{ delayMs: cp, netBps: realizedNetBps, profitUsd: realizedProfitUsd }],
            });
          }

          // Update route stats
          const stats = this.routeStats.get(exec.route);
          if (stats) {
            if (cp === 500 && realizedNetBps > 0) stats.survived500ms++;
            if (cp === 1000 && realizedNetBps > 0) stats.survived1s++;
            if (cp === 2000 && realizedNetBps > 0) stats.survived2s++;
            if (cp === 5000 && realizedNetBps > 0) stats.survived5s++;
          }

          // Log replay result
          const direction = realizedNetBps > 0 ? "✅" : "❌";
          logDebug(`PaperExec: ${direction} ${exec.route} @${cp}ms — detected=${exec.expectedNetBps.toFixed(1)}bps realized=${realizedNetBps.toFixed(1)}bps profit=${realizedProfitUsd.toFixed(4)}`);

          // Append to CSV
          const nowStr = new Date().toISOString().replace("T", " ").substring(0, 23);
          fs.appendFileSync(this.csvPath, `${nowStr},${exec.route},${cp},${exec.expectedNetBps.toFixed(2)},${realizedNetBps.toFixed(2)},${exec.expectedProfitUsd.toFixed(4)},${realizedProfitUsd.toFixed(4)}\n`);
        }

        // Route persisted past this checkpoint
        if (cp === 2000 && elapsed > cp && realizedNetBps < 0) {
          // Route died — stop tracking
        }
      }

      // Keep tracking if less than 10s elapsed
      if (elapsed < 10000) {
        stillPending.push(exec);
      }
    }

    this.pending = stillPending;
  }

  /** Re-simulate a route using current graph state */
  private simulateRoute(exec: PendingExecution): { netBps: number; profitUsd: number } | null {
    let runningAmount = exec.inputUsd;
    for (const step of exec.steps) {
      const edge = priceGraph.getDirectPrice(step.from, step.to);
      if (!edge || edge.health !== "VALID" || edge.price <= 0) return null;
      const feePct = Math.min(edge.fee, 100) / 10000;
      const slippageBps = this.calcSlippageBps(runningAmount, edge.liquidity);
      const afterFee = runningAmount * edge.price * (1 - feePct);
      const afterSlippage = afterFee * (1 - slippageBps / 10000);
      runningAmount = afterSlippage;
    }
    const profitUsd = runningAmount - exec.inputUsd;
    const netBps = ((runningAmount / exec.inputUsd) - 1) * 10000;
    return { netBps, profitUsd };
  }

  private calcSlippageBps(tradeUsd: number, liquidity: number): number {
    if (liquidity <= 0) return 50;
    const ratio = tradeUsd / liquidity;
    if (ratio < 0.001) return 0.5;
    if (ratio < 0.005) return 1;
    if (ratio < 0.01) return 2;
    if (ratio < 0.05) return 5;
    if (ratio < 0.1) return 10;
    return 20;
  }

  getStats(): { totalTracked: number; routeStats: RouteStats[] } {
    return {
      totalTracked: this.replays.length,
      routeStats: Array.from(this.routeStats.values()),
    };
  }

  printSummary(): void {
    const stats = this.getStats();
    if (stats.totalTracked === 0) return;

    logInfo("");
    logSuccess("══════════ PAPER EXECUTION SUMMARY ══════════");

    // Per-route stats
    for (const rs of stats.routeStats) {
      const survival1s = rs.detectionCount > 0 ? (rs.survived1s / rs.detectionCount * 100).toFixed(1) : "N/A";
      const survival2s = rs.detectionCount > 0 ? (rs.survived2s / rs.detectionCount * 100).toFixed(1) : "N/A";
      logInfo(`  ${rs.route}`);
      logInfo(`    Detections: ${rs.detectionCount} | Promoted: ${rs.promotedCount}`);
      logInfo(`    Survival: 500ms=${rs.survived500ms} 1s=${rs.survived1s} (${survival1s}%) 2s=${rs.survived2s} (${survival2s}%)`);
    }

    // Average decay across all replays
    let totalDecayBps = 0;
    let decayCount = 0;
    for (const r of this.replays) {
      for (const rp of r.replayed) {
        totalDecayBps += r.detectedNetBps - rp.netBps;
        decayCount++;
      }
    }
    const avgDecay = decayCount > 0 ? (totalDecayBps / decayCount) : 0;
    logInfo(`  Avg latency decay: ${avgDecay.toFixed(2)} bps`);

    // Survival rates
    const totalDetected = stats.routeStats.reduce((s, r) => s + r.detectionCount, 0);
    const totalSurvived1s = stats.routeStats.reduce((s, r) => s + r.survived1s, 0);
    const totalSurvived2s = stats.routeStats.reduce((s, r) => s + r.survived2s, 0);
    logInfo(`  Overall: ${stats.totalTracked} routes tracked, ${totalDetected} detections`);
    logInfo(`  Survive 1s: ${totalSurvived1s}/${totalDetected} (${totalDetected > 0 ? (totalSurvived1s/totalDetected*100).toFixed(1) : 0}%)`);
    logInfo(`  Survive 2s: ${totalSurvived2s}/${totalDetected} (${totalDetected > 0 ? (totalSurvived2s/totalDetected*100).toFixed(1) : 0}%)`);

    logInfo(`  Replay CSV: ${this.csvPath}`);
    logSuccess("══════════════════════════════════════════════");
  }

  reset(): void {
    this.pending = [];
    this.replays = [];
    this.routeStats.clear();
    if (this.checkTimer) clearInterval(this.checkTimer);
    this.checkTimer = null;
  }
}

export const paperExecution = new PaperExecutionEngine();
