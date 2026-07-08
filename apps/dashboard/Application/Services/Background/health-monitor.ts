import type { HealthProbe } from "../../../Ports/Health/health-probe.ts";
import type { AppEntry } from "../../../Domain/ValueObjects/app-entry.ts";
import type { HealthStatus } from "../../../Domain/ValueObjects/health-status.ts";
import { distinctTargets } from "../../../Domain/Services/health-target.ts";

/**
 * Owns the in-memory health-status cache and the background probe loop. Probes
 * are gated on recent client activity so the dashboard doesn't hammer every app
 * around the clock; an on-demand refresh (see the controller) covers the moment
 * a client returns after an idle gap.
 */
export class HealthMonitor {
  private probe: HealthProbe;
  private cache = new Map<string, HealthStatus>();
  private lastClientSeen = 0; // epoch ms of the last /api/apps request; 0 = never

  constructor(probe: HealthProbe) {
    this.probe = probe;
  }

  markClientSeen(): void {
    this.lastClientSeen = Date.now();
  }

  getStatus(target: string | null): HealthStatus {
    if (!target) return { status: "unknown", lastChecked: null };
    return this.cache.get(target) || { status: "unknown", lastChecked: null };
  }

  /**
   * True if the cache lacks a fresh probe result for any of these apps — a target
   * never checked, or last checked longer ago than `maxAgeMs`.
   */
  isStale(apps: AppEntry[], hostAddress: string, maxAgeMs: number): boolean {
    const now = Date.now();
    const targets = distinctTargets(apps, hostAddress);
    if (targets.length === 0) return false;
    return targets.some((target) => {
      const cached = this.cache.get(target);
      if (!cached?.lastChecked) return true;
      return now - Date.parse(cached.lastChecked) > maxAgeMs;
    });
  }

  /** Probe all targets concurrently and update the cache. */
  async refresh(
    apps: AppEntry[],
    hostAddress: string,
    now: string = new Date().toISOString(),
  ): Promise<void> {
    const targets = distinctTargets(apps, hostAddress);
    await Promise.all(
      targets.map(async (target) => {
        const status = await this.probe.probe(target);
        this.cache.set(target, { status, lastChecked: now });
      }),
    );
  }

  /** Poll on `intervalMs`, but only while a client polled within `activeWindowMs`. */
  startLoop(
    buildApps: () => Promise<AppEntry[]>,
    hostAddress: string,
    intervalMs: number,
    activeWindowMs: number,
  ): void {
    setInterval(() => void this.tick(buildApps, hostAddress, activeWindowMs), intervalMs);
  }

  private async tick(
    buildApps: () => Promise<AppEntry[]>,
    hostAddress: string,
    activeWindowMs: number,
  ): Promise<void> {
    if (Date.now() - this.lastClientSeen > activeWindowMs) return;
    try {
      const apps = await buildApps();
      await this.refresh(apps, hostAddress);
    } catch (err) {
      console.error(`[health] refresh failed: ${(err as Error).message}`);
    }
  }
}
