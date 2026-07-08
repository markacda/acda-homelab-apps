import type { Express } from "express";
import { YamlConfigSource } from "../../Adapters/Config/yaml-config-source.ts";
import { DockerodeContainerDiscovery } from "../../Adapters/Docker/dockerode-container-discovery.ts";
import { HttpHealthProbe } from "../../Adapters/Health/http-health-probe.ts";
import { DashboardService } from "../Services/dashboard-service.ts";
import { HealthMonitor } from "../Services/Background/health-monitor.ts";
import { DashboardController } from "../Controllers/dashboard-controller.ts";
import type { Config } from "../../Domain/ValueObjects/dashboard-config.ts";

export interface DashboardRuntime {
  config: Config;
  /** Start the gated background health-probe loop (call once listening). */
  startMonitoring: () => void;
}

/**
 * Composition root: load config, build the adapters, wire the services +
 * controller, mount the route, and hand back the config + a startMonitoring
 * closure for server.ts to invoke on listen.
 */
export function register(app: Express): DashboardRuntime {
  const config = new YamlConfigSource().load();
  const discovery = new DockerodeContainerDiscovery();
  const healthProbe = new HttpHealthProbe();

  const dashboardService = new DashboardService(discovery, config);
  const healthMonitor = new HealthMonitor(healthProbe);
  const controller = new DashboardController(config, dashboardService, healthMonitor);

  app.use(controller.router);

  const intervalMs = config.settings.healthCheckIntervalSeconds * 1000;
  // Consider a client "present" if it polled within 2x the probe interval (min
  // 60s) — leaves margin for a missed 30s client beat before we treat the
  // dashboard as unwatched.
  const activeWindowMs = Math.max(intervalMs * 2, 60_000);

  return {
    config,
    startMonitoring: () =>
      healthMonitor.startLoop(
        () => dashboardService.buildApps(),
        config.settings.hostAddress,
        intervalMs,
        activeWindowMs,
      ),
  };
}
