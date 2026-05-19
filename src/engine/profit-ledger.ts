import { logInfo } from "../logger";
import * as fs from "fs";
import * as path from "path";

function fmtDatetime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  const y = d.getUTCFullYear();
  const mo = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const h = pad(d.getUTCHours());
  const mi = pad(d.getUTCMinutes());
  const s = pad(d.getUTCSeconds());
  const ms = pad(d.getUTCMilliseconds(), 3);
  return `${y}-${mo}-${day} ${h}:${mi}:${s}.${ms}`;
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  const h = pad(d.getUTCHours());
  const mi = pad(d.getUTCMinutes());
  const s = pad(d.getUTCSeconds());
  const ms = pad(d.getUTCMilliseconds(), 3);
  return `${h}:${mi}:${s}.${ms}`;
}

export type OpportunityStatus = "REJECTED" | "PROFITABLE" | "EXECUTABLE" | "EXECUTED";

export interface OpportunityRecord {
  timestamp: number;
  scanId: number;
  route: string;
  type: "pair" | "multi_hop" | "triangular" | "latency_arb";
  inputUsd: number;
  outputUsd: number;
  grossBps: number;
  feesBps: number;
  slippageBps: number;
  netBps: number;
  netUsd: number;
  status: OpportunityStatus;
  confidence: number;
  buyDex: string;
  sellDex: string;
  latencyMs: number;
}

export interface SessionSummary {
  sessionStart: number;
  totalScans: number;
  totalOpportunities: number;
  profitableCount: number;
  executableCount: number;
  theoreticalPnlUsd: number;
  executablePnlUsd: number;
  avgNetBps: number;
  bestTradeUsd: number;
  worstTradeUsd: number;
}

export class ProfitLedger {
  private records: OpportunityRecord[] = [];
  private currentScanId = 0;
  private sessionStart = Date.now();
  private csvPathArb = "";
  private csvPathSession = "";
  private csvInitialized = false;
  private theoreticalPnlUsd = 0;
  private executablePnlUsd = 0;

  constructor() {
    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.csvPathArb = path.join(dataDir, "arbitrage_log.csv");
    this.csvPathSession = path.join(dataDir, "session_summary.csv");
  }

  nextScanId(): number {
    return ++this.currentScanId;
  }

  record(opp: Omit<OpportunityRecord, "scanId">, scanId?: number): void {
    const record: OpportunityRecord = {
      ...opp,
      scanId: scanId ?? this.currentScanId,
    };
    this.records.push(record);

    // Accumulate PnL
    if (record.status === "PROFITABLE" || record.status === "EXECUTABLE") {
      this.theoreticalPnlUsd += record.netUsd;
    }
    if (record.status === "EXECUTABLE") {
      this.executablePnlUsd += record.netUsd;
    }

    // Append to CSV
    this.appendCsv(record);
  }

  getTheoreticalPnl(): number {
    return this.theoreticalPnlUsd;
  }

  getExecutablePnl(): number {
    return this.executablePnlUsd;
  }

  getRecords(): OpportunityRecord[] {
    return [...this.records];
  }

  getProfitableCount(): number {
    return this.records.filter((r) => r.status === "PROFITABLE" || r.status === "EXECUTABLE").length;
  }

  getExecutableCount(): number {
    return this.records.filter((r) => r.status === "EXECUTABLE").length;
  }

  getBestTrade(): OpportunityRecord | null {
    const profitable = this.records.filter((r) => r.netUsd > 0);
    if (profitable.length === 0) return null;
    return profitable.reduce((a, b) => (a.netUsd > b.netUsd ? a : b));
  }

  getWorstTrade(): OpportunityRecord | null {
    const profitable = this.records.filter((r) => r.netUsd > 0);
    if (profitable.length === 0) return null;
    return profitable.reduce((a, b) => (a.netUsd < b.netUsd ? a : b));
  }

  getSessionSummary(): SessionSummary {
    const profitable = this.records.filter((r) => r.netUsd > 0);
    return {
      sessionStart: this.sessionStart,
      totalScans: this.currentScanId,
      totalOpportunities: this.records.length,
      profitableCount: profitable.length,
      executableCount: this.getExecutableCount(),
      theoreticalPnlUsd: this.theoreticalPnlUsd,
      executablePnlUsd: this.executablePnlUsd,
      avgNetBps: profitable.length > 0 ? profitable.reduce((s, r) => s + r.netBps, 0) / profitable.length : 0,
      bestTradeUsd: this.getBestTrade()?.netUsd ?? 0,
      worstTradeUsd: this.getWorstTrade()?.netUsd ?? 0,
    };
  }

  printSessionSummary(): void {
    const s = this.getSessionSummary();
    logInfo("");
    logInfo(`══════════ SESSION SUMMARY ══════════`);
    logInfo(`  Scans:              ${s.totalScans}`);
    logInfo(`  Opportunities:      ${s.totalOpportunities}`);
    logInfo(`  Profitable:         ${s.profitableCount}`);
    logInfo(`  Executable:         ${s.executableCount}`);
    logInfo(`  Theoretical P&L:    ${s.theoreticalPnlUsd >= 0 ? "+" : ""}$${s.theoreticalPnlUsd.toFixed(4)}`);
    logInfo(`  Executable P&L:     ${s.executablePnlUsd >= 0 ? "+" : ""}$${s.executablePnlUsd.toFixed(4)}`);
    logInfo(`  Avg Net Bps:        ${s.avgNetBps.toFixed(2)} bps`);
    logInfo(`  Best Trade:         ${s.bestTradeUsd >= 0 ? "+" : ""}$${s.bestTradeUsd.toFixed(4)}`);
    logInfo(`  Worst Trade:        ${s.worstTradeUsd >= 0 ? "+" : ""}$${s.worstTradeUsd.toFixed(4)}`);
    logInfo(`══════════════════════════════════════`);
  }

  exportSessionSummary(): void {
    const s = this.getSessionSummary();
    const header = "datetime_utc,time_utc,session_start_ms,session_end_ms,total_scans,total_opportunities,profitable_count,executable_count,theoretical_pnl_usd,executable_pnl_usd,avg_net_bps,best_trade_usd,worst_trade_usd";
    const row = `${fmtDatetime(s.sessionStart)},${fmtTime(Date.now())},${s.sessionStart},${Date.now()},${s.totalScans},${s.totalOpportunities},${s.profitableCount},${s.executableCount},${s.theoreticalPnlUsd.toFixed(4)},${s.executablePnlUsd.toFixed(4)},${s.avgNetBps.toFixed(2)},${s.bestTradeUsd.toFixed(4)},${s.worstTradeUsd.toFixed(4)}`;
    const exists = fs.existsSync(this.csvPathSession);
    if (!exists) {
      fs.writeFileSync(this.csvPathSession, header + "\n");
    }
    fs.appendFileSync(this.csvPathSession, row + "\n");
  }

  private appendCsv(record: OpportunityRecord): void {
    if (!this.csvInitialized) {
      const header = "datetime_utc,time_utc,timestamp_ms,scan_id,route,type,input_usd,output_usd,gross_bps,fees_bps,slippage_bps,net_bps,net_usd,status,confidence,buy_dex,sell_dex,latency_ms";
      // Overwrite per session: fresh header matching current column format
      fs.writeFileSync(this.csvPathArb, header + "\n");
      this.csvInitialized = true;
    }
    const row = `${fmtDatetime(record.timestamp)},${fmtTime(record.timestamp)},${record.timestamp},${record.scanId},"${record.route}",${record.type},${record.inputUsd.toFixed(2)},${record.outputUsd.toFixed(4)},${record.grossBps.toFixed(2)},${record.feesBps.toFixed(2)},${record.slippageBps.toFixed(2)},${record.netBps.toFixed(2)},${record.netUsd.toFixed(4)},${record.status},${record.confidence.toFixed(2)},${record.buyDex},${record.sellDex},${record.latencyMs}`;
    fs.appendFileSync(this.csvPathArb, row + "\n");
  }

  /** Invariant: if theoretical PnL > 0, there must be at least 1 PROFITABLE record */
  checkInvariant(): void {
    if (this.theoreticalPnlUsd > 0) {
      const profitable = this.records.filter((r) => r.status === "PROFITABLE" || r.status === "EXECUTABLE");
      if (profitable.length === 0) {
        logInfo(`⚠️ INVARIANT FAIL: Theoretical PnL=$${this.theoreticalPnlUsd.toFixed(4)} but 0 PROFITABLE records`);
      }
    }
  }

  reset(): void {
    this.records = [];
    this.currentScanId = 0;
    this.sessionStart = Date.now();
    this.theoreticalPnlUsd = 0;
    this.executablePnlUsd = 0;
  }
}

export const profitLedger = new ProfitLedger();
