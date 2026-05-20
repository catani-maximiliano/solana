import { logInfo } from "../../logger";

interface WalletProfile {
  wallet: string;
  totalVolume: number;
  tradeCount: number;
  netPosition: number; // positive = accumulated
  lastTrade: number;
  confidence: number;
}

const MIN_VOLUME_FOR_TRACKING = 10_000;

export class SmartMoneyTracker {
  private wallets = new Map<string, WalletProfile>();

  /** Track a wallet's activity */
  track(wallet: string, volume: number, isBuy: boolean): void {
    let profile = this.wallets.get(wallet);
    if (!profile) {
      profile = { wallet, totalVolume: 0, tradeCount: 0, netPosition: 0, lastTrade: 0, confidence: 0 };
      this.wallets.set(wallet, profile);
    }

    profile.totalVolume += volume;
    profile.tradeCount++;
    profile.netPosition += isBuy ? volume : -volume;
    profile.lastTrade = Date.now();

    if (profile.totalVolume > MIN_VOLUME_FOR_TRACKING) {
      // Confidence based on consistency
      profile.confidence = Math.min(1, (profile.totalVolume / 1_000_000) * (profile.tradeCount / 10));
    }
  }

  /** Check if a wallet has accumulated net position */
  getAccumulationSignal(token: string): "BUYING" | "SELLING" | "NEUTRAL" {
    let net = 0;
    for (const [, w] of this.wallets) {
      if (Date.now() - w.lastTrade < 300_000) net += w.netPosition;
    }
    if (net > 100_000) return "BUYING";
    if (net < -100_000) return "SELLING";
    return "NEUTRAL";
  }

  getTopWallets(n = 5): WalletProfile[] {
    return Array.from(this.wallets.values())
      .sort((a, b) => b.totalVolume - a.totalVolume)
      .slice(0, n);
  }

  reset(): void { this.wallets.clear(); }
}

export const smartMoneyTracker = new SmartMoneyTracker();
