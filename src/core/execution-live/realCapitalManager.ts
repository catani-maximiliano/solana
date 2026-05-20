import { CapitalState } from "./types";
import { logInfo } from "../../logger";

const CAPITAL_STEPS = [0.005, 0.01, 0.02, 0.05, 0.1];

export class RealCapitalManager {
  private state: CapitalState = { totalCapitalSol: 0.1, allocatedSol: 0, availableSol: 0.1, maxTradeSol: 0.005, step: 0 };
  private consecutiveWins = 0;
  private totalTrades = 0;

  constructor() { this.state.maxTradeSol = CAPITAL_STEPS[0]; }

  requestTrade(): number {
    if (this.state.availableSol < this.state.maxTradeSol) return 0;
    const trade = Math.min(this.state.maxTradeSol, this.state.availableSol);
    this.state.allocatedSol += trade;
    this.state.availableSol -= trade;
    return trade;
  }

  settleTrade(profitSol: number): void {
    this.totalTrades++;
    this.state.allocatedSol = 0;
    const net = profitSol;
    this.state.totalCapitalSol += net;
    this.state.availableSol = this.state.totalCapitalSol;

    if (profitSol > 0) {
      this.consecutiveWins++;
      // Scale up after consecutive wins
      if (this.consecutiveWins >= 3 && this.state.step < CAPITAL_STEPS.length - 1) {
        this.state.step++;
        this.state.maxTradeSol = CAPITAL_STEPS[this.state.step];
        this.consecutiveWins = 0;
        logInfo(`[CAPITAL] Scaling up to ${this.state.maxTradeSol} SOL/ trade (win streak ${this.consecutiveWins})`);
      }
    } else {
      this.consecutiveWins = 0;
      // Scale down on loss
      if (this.state.step > 0) {
        this.state.step--;
        this.state.maxTradeSol = CAPITAL_STEPS[this.state.step];
        logInfo(`[CAPITAL] Scaling down to ${this.state.maxTradeSol} SOL/trade (loss)`);
      }
    }
  }

  getState(): CapitalState { return { ...this.state }; }

  reset(): void {
    this.state = { totalCapitalSol: 0.1, allocatedSol: 0, availableSol: 0.1, maxTradeSol: 0.005, step: 0 };
    this.consecutiveWins = 0;
    this.totalTrades = 0;
  }
}

export const realCapitalManager = new RealCapitalManager();
