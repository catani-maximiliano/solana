import { logWarning, logInfo } from "../../logger";

interface KillSwitchRule {
  name: string;
  threshold: number;
  windowMs: number;
  values: number[];
  killed: boolean;
}

export class StrategyKillSwitch {
  private rules: KillSwitchRule[] = [
    { name: "timing", threshold: 0.3, windowMs: 60_000, values: [], killed: false },
    { name: "adversarial", threshold: 0.25, windowMs: 60_000, values: [], killed: false },
    { name: "predictive", threshold: 0.2, windowMs: 120_000, values: [], killed: false },
    { name: "execution", threshold: 0.15, windowMs: 60_000, values: [], killed: false },
  ];

  record(name: string, performance: number): void {
    const rule = this.rules.find(r => r.name === name);
    if (!rule || rule.killed) return;
    rule.values.push(performance);
    if (rule.values.length > 20) rule.values.shift();
    if (rule.values.length < 5) return;

    const avg = rule.values.reduce((a, b) => a + b, 0) / rule.values.length;
    if (avg < rule.threshold) {
      rule.killed = true;
      logWarning(`[KILLSWITCH] ${name} engine killed — performance ${(avg * 100).toFixed(0)}% < threshold ${(rule.threshold * 100).toFixed(0)}%`);
    }
  }

  isKilled(name: string): boolean {
    return this.rules.find(r => r.name === name)?.killed || false;
  }

  revive(name: string): void {
    const rule = this.rules.find(r => r.name === name);
    if (rule) { rule.killed = false; rule.values = []; logInfo(`[KILLSWITCH] ${name} engine revived`); }
  }

  reset(): void { for (const r of this.rules) { r.killed = false; r.values = []; } }
}

export const strategyKillSwitch = new StrategyKillSwitch();
