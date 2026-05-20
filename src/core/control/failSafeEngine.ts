import { healthSupervisor } from "./healthSupervisor";
import { resourceMonitor } from "./resourceMonitor";
import { logInfo, logWarning } from "../../logger";

export class FailSafeEngine {
  private degradedFeatures = new Set<string>();
  private emergencyCount = 0;

  /** Check system health and activate emergency mode if needed */
  check(): void {
    const health = healthSupervisor.check();
    const resources = resourceMonitor.getUsage();

    if (health.graphFrozen || health.streamsStalled > 3) {
      this.activateEmergency("critical system degradation");
      return;
    }

    if (resourceMonitor.isOverloaded()) {
      this.degradeFeatures();
      return;
    }

    if (this.emergencyCount > 0 && health.streamsHealthy > 0 && !health.graphFrozen) {
      this.deactivateEmergency();
    }
  }

  private activateEmergency(reason: string): void {
    this.emergencyCount++;
    healthSupervisor.setEmergency(true);
    logWarning(`[FAILSAFE] EMERGENCY MODE: ${reason} (count=${this.emergencyCount})`);

    // Drop all non-critical features
    this.degradedFeatures.add("timing");
    this.degradedFeatures.add("adversarial");
    this.degradedFeatures.add("predictive");
  }

  private deactivateEmergency(): void {
    this.emergencyCount = 0;
    healthSupervisor.setEmergency(false);
    this.degradedFeatures.clear();
    logInfo("[FAILSAFE] Emergency mode deactivated — system recovered");
  }

  private degradeFeatures(): void {
    if (!this.degradedFeatures.has("timing")) {
      this.degradedFeatures.add("timing");
      logWarning("[FAILSAFE] Degrading timing engine (resource pressure)");
    }
  }

  isFeatureDegraded(feature: string): boolean {
    return this.degradedFeatures.has(feature);
  }

  inEmergency(): boolean { return this.emergencyCount > 0; }

  reset(): void { this.degradedFeatures.clear(); this.emergencyCount = 0; }
}

export const failSafeEngine = new FailSafeEngine();
