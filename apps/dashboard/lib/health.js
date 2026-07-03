const CHECK_TIMEOUT_MS = 3000;

// In-memory status cache keyed by the app's health target URL.
const statusCache = new Map();

/**
 * Resolve the URL the server should probe for reachability. For discovered
 * containers we cannot use the client-facing hostname (the server sits inside
 * a container), so we build it from settings.hostAddress + the published port.
 */
export function healthTarget(app, hostAddress) {
  if (app.url) return app.url;
  if (app.port) return `http://${hostAddress}:${app.port}`;
  return null;
}

export function getStatus(target) {
  if (!target) return { status: "unknown", lastChecked: null };
  return statusCache.get(target) || { status: "unknown", lastChecked: null };
}

async function probe(target) {
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
export async function refreshHealth(apps, hostAddress, now = new Date().toISOString()) {
  const targets = [...new Set(apps.map((a) => healthTarget(a, hostAddress)).filter(Boolean))];
  await Promise.all(
    targets.map(async (target) => {
      const status = await probe(target);
      statusCache.set(target, { status, lastChecked: now });
    }),
  );
}
