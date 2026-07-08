import { Router } from "express";
import type { Config } from "../../Domain/ValueObjects/dashboard-config.ts";
import { DashboardService } from "../Services/dashboard-service.ts";
import { HealthMonitor } from "../Services/Background/health-monitor.ts";
import { healthTarget } from "../../Domain/Services/health-target.ts";
import type { AppsResponse } from "../../Models/Responses/apps-response.ts";

/**
 * HTTP surface for the dashboard: GET /api/apps returns the merged, health-
 * enriched tile list. The dashboard shell (index.html) is served statically from
 * Web/public by startServer.
 */
export class DashboardController {
  readonly router: Router;
  private config: Config;
  private dashboard: DashboardService;
  private health: HealthMonitor;

  constructor(config: Config, dashboard: DashboardService, health: HealthMonitor) {
    this.config = config;
    this.dashboard = dashboard;
    this.health = health;
    const router = Router();

    router.get("/api/apps", async (_req, res) => {
      try {
        this.health.markClientSeen();
        const apps = await this.dashboard.buildApps();
        const hostAddress = this.config.settings.hostAddress;
        const intervalMs = this.config.settings.healthCheckIntervalSeconds * 1000;
        // A freshly-opened dashboard (or one returning after idle) may find a
        // stale cache; probe now so the first render shows current status.
        if (this.health.isStale(apps, hostAddress, intervalMs)) {
          await this.health.refresh(apps, hostAddress);
        }
        const tiles = apps.map((a) => {
          const { status, lastChecked } = this.health.getStatus(healthTarget(a, hostAddress));
          return {
            name: a.name,
            url: a.url || null,
            port: a.port || null,
            icon: a.icon || null,
            group: a.group || null,
            status,
            lastChecked,
          };
        });
        const body: AppsResponse = { title: this.config.settings.title, apps: tiles };
        res.json(body);
      } catch (err) {
        console.error(`[api] /api/apps failed: ${(err as Error).message}`);
        res.status(500).json({ error: "Failed to build app list" });
      }
    });

    this.router = router;
  }
}
