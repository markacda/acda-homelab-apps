import type { AppEntry } from '../ValueObjects/app-entry.ts';

/**
 * Resolve the URL the server should probe for reachability. For discovered
 * containers we cannot use the client-facing hostname (the server sits inside a
 * container), so we build it from hostAddress + the published port.
 */
export function healthTarget(app: AppEntry, hostAddress: string): string | null {
  if (app.url) return app.url;
  if (app.port) return `http://${hostAddress}:${app.port}`;
  return null;
}

/** The distinct, probeable targets across a set of apps. */
export function distinctTargets(apps: AppEntry[], hostAddress: string): string[] {
  return [...new Set(apps.map((a) => healthTarget(a, hostAddress)).filter((t): t is string => Boolean(t)))];
}
