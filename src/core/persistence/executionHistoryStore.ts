import { LedgerEntry } from "./types";
import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.join(process.cwd(), "data");

export class ExecutionHistoryStore {
  private entries: LedgerEntry[] = [];
  private filePath = path.join(DATA_DIR, "execution_history.jsonl");

  constructor() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  append(entry: LedgerEntry): void {
    this.entries.push(entry);
    if (this.entries.length > 10000) this.entries.shift();
    try {
      fs.appendFileSync(this.filePath, JSON.stringify(entry) + "\n");
    } catch {}
  }

  getRecent(n = 100): LedgerEntry[] { return this.entries.slice(-n); }

  getAll(): LedgerEntry[] { return this.entries; }

  /** Get entries within a time window */
  getWindow(windowMs: number): LedgerEntry[] {
    const cutoff = Date.now() - windowMs;
    return this.entries.filter(e => e.timestamp >= cutoff);
  }

  reset(): void { this.entries = []; }
}

export const executionHistoryStore = new ExecutionHistoryStore();
