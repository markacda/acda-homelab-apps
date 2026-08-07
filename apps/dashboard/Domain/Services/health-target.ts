import type { AppEntry } from '../ValueObjects/app-entry.ts';

/**
 * Resolve the URL the server should probe for reachability. For discovered
 * containers we cannot use the client-facing hostname (the server sits inside a
 * container), so we build it from hostAddress + the published port.
 *
 * The port-derived target probes each app's public `/healthz` endpoint: the apps
 * now gate their shell behind the auth guard (which 302-redirects a probe with no
 * session), whereas `/healthz` stays public and returns 200 — so the probe reflects
 * reachability without a login and doesn't log a spurious redirect (issue #186).
 * That is only the *default* path, though: `/healthz` is this repo's server-kit
 * convention, so an external tile can override it via `healthPath` (Home Assistant
 * has no such endpoint and would 404 every probe). `healthPath` only applies to
 * this port-derived branch — an absolute `url` is probed verbatim.
 *
 * A relative `url` (e.g. "/atc", a reverse-proxy path) is only a client-side
 * link, not something the server can probe, so we prefer the published port for
 * those and only fall back to the url when there's no port.
 */
const DEFAULT_HEALTH_PATH = '/healthz';

function healthPathOf(app: AppEntry): string {
  const path = app.healthPath?.trim() || DEFAULT_HEALTH_PATH;
  return path.startsWith('/') ? path : `/${path}`;
}

export function healthTarget(app: AppEntry, hostAddress: string): string | null {
  if (app.url && /^https?:\/\//i.test(app.url)) return app.url;
  if (app.port) return `http://${hostAddress}:${app.port}${healthPathOf(app)}`;
  if (app.url) return app.url;
  return null;
}

/** The distinct, probeable targets across a set of apps. */
export function distinctTargets(apps: AppEntry[], hostAddress: string): string[] {
  return [...new Set(apps.map((a) => healthTarget(a, hostAddress)).filter((t): t is string => Boolean(t)))];
}
