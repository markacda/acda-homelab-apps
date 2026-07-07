import type { AppEntry } from "./config.ts";
import { DISCOVERY_UA } from "../../Common/access-log/constants.ts";

const CHECK_TIMEOUT_MS = 3000;

// Re-exported so callers of this module (and its tests) keep a single import
// site; the canonical definition lives in @homelab/access-log.
export { DISCOVERY_UA };

export interface HealthStatus {
  status: "up" | "down" | "unknown";
  lastChecked: string | null;
}

// In-memory status cache keyed by the app's health target URL.
const statusCache = new Map<string, HealthStatus>();

/**
 * Resolve the URL the server should probe for reachability. For discovered
 * containers we cannot use the client-facing hostname (the server sits inside
 * a container), so we build it from settings.hostAddress + the published port.
 */
export function healthTarget(app: AppEntry, hostAddress: string): string | null {
  if (app.url) return app.url;
  if (app.port) return `http://${hostAddress}:${app.port}`;
  return null;
}

export function getStatus(target: string | null): HealthStatus {
  if (!target) return { status: "unknown", lastChecked: null };
  return statusCache.get(target) || { status: "unknown", lastChecked: null };
}

/**
 * True if the cache lacks a fresh probe result for any of these apps — i.e. a
 * target has never been checked or its last check is older than `maxAgeMs`.
 * Used to trigger an on-demand refresh when a client opens the dashboard after
 * the probe loop has been idle.
 */
export function isHealthStale(apps: AppEntry[], hostAddress: string, maxAgeMs: number): boolean {
  const now = Date.now();
  const targets = [
    ...new Set(
      apps.map((a) => healthTarget(a, hostAddress)).filter((t): t is string => Boolean(t)),
    ),
  ];
  if (targets.length === 0) return false;
  return targets.some((target) => {
    const cached = statusCache.get(target);
    if (!cached?.lastChecked) return true;
    return now - Date.parse(cached.lastChecked) > maxAgeMs;
  });
}

async function probe(target: string): Promise<"up" | "down"> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    // Any HTTP response (incl. 4xx/5xx) means the service is reachable.
    await fetch(target, {
      method: "GET",
      signal: controller.signal,
      redirect: "manual",
      headers: { "user-agent": DISCOVERY_UA },
    });
    return "up";
  } catch {
    return "down";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probe all given targets concurrently and update the cache. Timestamp is
 * passed in by the caller (kept out of this module for testability).
 */
export async function refreshHealth(
  apps: AppEntry[],
  hostAddress: string,
  now: string = new Date().toISOString(),
): Promise<void> {
  const targets = [
    ...new Set(
      apps.map((a) => healthTarget(a, hostAddress)).filter((t): t is string => Boolean(t)),
    ),
  ];
  await Promise.all(
    targets.map(async (target) => {
      const status = await probe(target);
      statusCache.set(target, { status, lastChecked: now });
    }),
  );
}
