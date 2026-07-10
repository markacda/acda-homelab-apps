import type { AppEntry } from "../ValueObjects/app-entry.ts";
import type { Config } from "../ValueObjects/dashboard-config.ts";

// Pure domain logic for combining app sources into the ordered tile list. No I/O
// so it is directly unit-tested.

/** Order apps alphabetically by display name (case-insensitive). */
function compareByName(a: AppEntry, b: AppEntry): number {
  return (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" });
}

/**
 * Merge discovered container entries with config overrides and manual apps.
 * Order: discovered → apply per-container overrides (incl. `hidden`) →
 * append manual apps → dedupe by url (falling back to name) → sort by name.
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

  result.sort(compareByName);
  return result;
}
