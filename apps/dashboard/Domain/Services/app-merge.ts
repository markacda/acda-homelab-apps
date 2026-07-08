import type { AppEntry } from "../ValueObjects/app-entry.ts";
import type { Config } from "../ValueObjects/dashboard-config.ts";

// Pure domain logic for combining app sources into the ordered tile list. No I/O
// so it is directly unit-tested.

/**
 * Numeric rank used to order tiles by their url/port. Port-based apps sort by
 * their port; url-based apps sort by the port in the url (defaulting to 443 for
 * https and 80 for http). Anything without a target sorts last.
 */
function portRank(app: AppEntry): number {
  if (app.port) return Number(app.port);
  if (app.url) {
    try {
      const u = new URL(app.url);
      if (u.port) return Number(u.port);
      return u.protocol === "https:" ? 443 : 80;
    } catch {
      return Number.MAX_SAFE_INTEGER;
    }
  }
  return Number.MAX_SAFE_INTEGER;
}

/** Order apps by port/url, tie-breaking on the link target then the name. */
function compareByTarget(a: AppEntry, b: AppEntry): number {
  const rank = portRank(a) - portRank(b);
  if (rank !== 0) return rank;
  const target = (a.url || "").localeCompare(b.url || "");
  if (target !== 0) return target;
  return (a.name || "").localeCompare(b.name || "");
}

/**
 * Merge discovered container entries with config overrides and manual apps.
 * Order: discovered → apply per-container overrides (incl. `hidden`) →
 * append manual apps → dedupe by url (falling back to name) → sort by url/port.
 */
export function mergeApps(
  discovered: AppEntry[],
  config: Pick<Config, "apps" | "overrides">,
): AppEntry[] {
  const merged: AppEntry[] = [];

  for (const app of discovered) {
    const override =
      (app.containerName ? config.overrides[app.containerName] : undefined) ||
      (app.name ? config.overrides[app.name] : undefined);
    if (override && override.hidden === true) continue;
    merged.push({ ...app, ...(override || {}) });
  }

  for (const app of config.apps) {
    if (app && app.hidden !== true && (app.name || app.url)) {
      merged.push({ source: "config", ...app });
    }
  }

  // Dedupe, keeping the first occurrence.
  const seen = new Set<string>();
  const result: AppEntry[] = [];
  for (const app of merged) {
    const key = (app.url || app.name || "").toLowerCase();
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    result.push(app);
  }

  result.sort(compareByTarget);
  return result;
}
