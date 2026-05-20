import { AuditEntry } from "./types";
import { logInfo } from "../../logger";

export class DecisionAudit {
  private entries: AuditEntry[] = [];

  record(entry: AuditEntry): void {
    this.entries.push(entry);
    if (this.entries.length > 1000) this.entries.shift();
    logInfo(`[AUDIT] ${entry.decision} ${entry.reason} (${entry.latencyMs}ms)`);
  }

  getRecent(n = 20): AuditEntry[] { return this.entries.slice(-n); }
  getCount(): number { return this.entries.length; }

  reset(): void { this.entries = []; }
}

export const decisionAudit = new DecisionAudit();
