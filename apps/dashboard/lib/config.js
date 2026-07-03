import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG_PATH = join(__dirname, "..", "config", "config.yaml");

const DEFAULTS = {
  settings: {
    title: "Homelab Dashboard",
    hostAddress: "host.docker.internal",
    healthCheckIntervalSeconds: 30,
    autoDiscover: true,
  },
  discovery: {
    requireLabel: false,
    ignore: [],
  },
  apps: [],
  overrides: {},
};

/**
 * Load and normalize config.yaml. A missing file is tolerated (defaults are
 * used, i.e. auto-discovery-only mode). Environment variables override the
 * matching settings when present.
 */
export function loadConfig(configPath = process.env.CONFIG_PATH || DEFAULT_CONFIG_PATH) {
  let raw = {};
  try {
    const text = readFileSync(configPath, "utf8");
    raw = yaml.load(text) || {};
  } catch (err) {
    if (err.code === "ENOENT") {
      console.warn(
        `[config] ${configPath} not found — running with defaults (auto-discovery only).`,
      );
    } else {
      console.error(`[config] Failed to read ${configPath}: ${err.message}. Using defaults.`);
    }
  }

  const settings = { ...DEFAULTS.settings, ...(raw.settings || {}) };
  const discovery = { ...DEFAULTS.discovery, ...(raw.discovery || {}) };

  // Environment overrides
  if (process.env.HOST_ADDRESS) settings.hostAddress = process.env.HOST_ADDRESS;
  if (process.env.TITLE) settings.title = process.env.TITLE;
  if (process.env.HEALTH_INTERVAL) {
    const n = Number(process.env.HEALTH_INTERVAL);
    if (Number.isFinite(n) && n > 0) settings.healthCheckIntervalSeconds = n;
  }

  // Normalize types
  settings.healthCheckIntervalSeconds = Number(settings.healthCheckIntervalSeconds) || 30;
  settings.autoDiscover = settings.autoDiscover !== false;
  discovery.requireLabel = discovery.requireLabel === true;
  discovery.ignore = Array.isArray(discovery.ignore) ? discovery.ignore.map(String) : [];

  const apps = Array.isArray(raw.apps) ? raw.apps : [];
  const overrides = raw.overrides && typeof raw.overrides === "object" ? raw.overrides : {};

  return { settings, discovery, apps, overrides };
}

/**
 * Numeric rank used to order tiles by their url/port. Port-based apps sort by
 * their port; url-based apps sort by the port in the url (defaulting to 443 for
 * https and 80 for http). Anything without a target sorts last.
 */
function portRank(app) {
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
function compareByTarget(a, b) {
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
export function mergeApps(discovered, config) {
  const merged = [];

  for (const app of discovered) {
    const override = config.overrides[app.containerName] || config.overrides[app.name];
    if (override && override.hidden === true) continue;
    merged.push({ ...app, ...(override || {}) });
  }

  for (const app of config.apps) {
    if (app && app.hidden !== true && (app.name || app.url)) {
      merged.push({ source: "config", ...app });
    }
  }

  // Dedupe, keeping the first occurrence.
  const seen = new Set();
  const result = [];
  for (const app of merged) {
    const key = (app.url || app.name || "").toLowerCase();
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    result.push(app);
  }

  result.sort(compareByTarget);
  return result;
}
