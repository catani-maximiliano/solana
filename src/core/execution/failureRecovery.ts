import { logWarning } from "../../logger";

type FailureMode = "STALE_TX" | "EXPIRED_OPPORTUNITY" | "COMPUTE_EXCEEDED" | "SLIPPAGE_EXCEEDED" | "ROUTE_COLLAPSE";

interface RecoveryAction {
  action: "RETRY" | "REROUTE" | "CANCEL" | "DOWNGRADE";
  delayMs: number;
}

export class FailureRecovery {
  private failureCount = new Map<string, number>();

  /** Determine recovery action based on failure mode */
  recover(mode: FailureMode, route: string): RecoveryAction {
    const count = (this.failureCount.get(route) || 0) + 1;
    this.failureCount.set(route, count);

    logWarning(`[RECOVERY] ${mode} route=${route} attempt=${count}`);

    switch (mode) {
      case "STALE_TX":
        return { action: count > 3 ? "CANCEL" : "RETRY", delayMs: count * 200 };
      case "EXPIRED_OPPORTUNITY":
        return { action: "CANCEL", delayMs: 0 };
      case "COMPUTE_EXCEEDED":
        return { action: "DOWNGRADE", delayMs: 100 };
      case "SLIPPAGE_EXCEEDED":
        return { action: count > 2 ? "CANCEL" : "RETRY", delayMs: count * 500 };
      case "ROUTE_COLLAPSE":
        return { action: "REROUTE", delayMs: 200 };
      default:
        return { action: "RETRY", delayMs: 1000 };
    }
  }

  reset(): void { this.failureCount.clear(); }
}

export const failureRecovery = new FailureRecovery();
