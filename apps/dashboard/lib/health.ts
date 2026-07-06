import type { AppEntry } from "./config.ts";

const CHECK_TIMEOUT_MS = 3000;

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

async function probe(target: string): Promise<"up" | "down"> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    // Any HTTP response (incl. 4xx/5xx) means the service is reachable.
    await fetch(target, { method: "GET", signal: controller.signal, redirect: "manual" });
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
