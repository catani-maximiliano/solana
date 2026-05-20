import { logInfo, logWarning } from "../../logger";

const RELAYS = [
  { url: "frankfurt.mainnet.block-engine.jito.wtf", region: "frankfurt" },
  { url: "amsterdam.mainnet.block-engine.jito.wtf", region: "amsterdam" },
  { url: "tokyo.mainnet.block-engine.jito.wtf", region: "tokyo" },
];

interface RelayState {
  url: string;
  latencyMs: number;
  lastUsed: number;
  successCount: number;
  failureCount: number;
}

export class JitoRelayManager {
  private relays: RelayState[] = RELAYS.map(r => ({ ...r, latencyMs: 50, lastUsed: 0, successCount: 0, failureCount: 0 }));

  /** Get best relay based on historical performance */
  getBestRelay(): RelayState {
    const sorted = [...this.relays].sort((a, b) => {
      const aScore = a.successCount - a.failureCount * 2 - a.latencyMs * 0.1;
      const bScore = b.successCount - b.failureCount * 2 - b.latencyMs * 0.1;
      return bScore - aScore;
    });
    return sorted[0];
  }

  /** Record relay outcome */
  recordOutcome(relayUrl: string, success: boolean, latencyMs: number): void {
    const relay = this.relays.find(r => r.url === relayUrl);
    if (!relay) return;
    if (success) relay.successCount++;
    else relay.failureCount++;
    relay.latencyMs = Math.round((relay.latencyMs * 0.7 + latencyMs * 0.3));
    relay.lastUsed = Date.now();
  }

  getAllRelays(): string[] { return this.relays.map(r => r.url); }

  reset(): void { this.relays.forEach(r => { r.latencyMs = 50; r.successCount = 0; r.failureCount = 0; }); }
}

export const jitoRelayManager = new JitoRelayManager();
