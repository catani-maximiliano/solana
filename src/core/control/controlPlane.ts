import { latencyProfiler } from "./latencyProfiler";
import { resourceMonitor } from "./resourceMonitor";
import { healthSupervisor } from "./healthSupervisor";
import { failSafeEngine } from "./failSafeEngine";
import { decisionAudit } from "./decisionAudit";
import { strategyKillSwitch } from "./strategyKillSwitch";
import { logInfo, logSuccess, logWarning } from "../../logger";

export class ControlPlane {
  /** Periodic health check - called every 30s */
  healthCheck(): void {
    failSafeEngine.check();
    const health = healthSupervisor.check();
    const resources = resourceMonitor.getUsage();

    if (failSafeEngine.inEmergency()) {
      logWarning(`[CONTROL] EMERGENCY MODE ACTIVE — degraded: ${failSafeEngine.isFeatureDegraded("timing") ? "timing " : ""}${failSafeEngine.isFeatureDegraded("adversarial") ? "adversarial" : ""}`);
    }

    this.logDashboard();
  }

  /** Print control plane dashboard */
  logDashboard(): void {
    const lat = latencyProfiler.getPipelineLatency();
    const resources = resourceMonitor.getUsage();
    const health = healthSupervisor.check();

    logSuccess(`━━━━━━━━ [CONTROL PLANE] ──────────`);
    logInfo(`Pipeline latency: ${latencyProfiler.getTotalMs()}ms (ingest=${lat.ingestionMs}ms route=${lat.routingMs}ms graph=${lat.graphUpdateMs}ms decide=${lat.decisionMs}ms timing=${lat.timingMs}ms)`);
    logInfo(`Event backlog: ${resources.eventBacklog} | Processing: ${resources.processingLatencyMs}ms`);
    logInfo(`Streams: ${health.streamsHealthy} healthy, ${health.streamsStalled} stalled`);
    logInfo(`Graph frozen: ${health.graphFrozen} | Emergency: ${health.emergencyMode}`);
    logInfo(`Audit entries: ${decisionAudit.getCount()}`);
    logSuccess(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  reset(): void {
    latencyProfiler.reset();
    resourceMonitor.reset();
    healthSupervisor.reset();
    failSafeEngine.reset();
    decisionAudit.reset();
    strategyKillSwitch.reset();
  }
}

export const controlPlane = new ControlPlane();
