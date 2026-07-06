import express from "express";
import { join } from "node:path";

import { loadConfig, mergeApps } from "./lib/config.ts";
import type { AppEntry } from "./lib/config.ts";
import { discoverApps } from "./lib/discovery.ts";
import { refreshHealth, getStatus, healthTarget, isHealthStale } from "./lib/health.ts";
import { pageLoadLogger, installConsoleLogging } from "../../packages/access-log/logger.ts";

// Mirror console.* output into the structured app.log (see log-viewer).
installConsoleLogging("dashboard");

// public/ resolves from the app root (cwd) — true both in dev (npm runs from
// the app dir) and in Docker (WORKDIR /app) — so it works whether we run
// server.ts directly or the compiled dist/server.js.
const PUBLIC_DIR = join(process.cwd(), "public");
const PORT = Number(process.env.PORT) || 8080;

const config = loadConfig();
const app = express();

const HEALTH_INTERVAL_MS = config.settings.healthCheckIntervalSeconds * 1000;
// Consider a client "present" if it polled /api/apps within this window. The
// browser client refreshes every 30s, so 2x the probe interval (min 60s) leaves
// margin for a missed beat before we treat the dashboard as unwatched.
const ACTIVE_WINDOW_MS = Math.max(HEALTH_INTERVAL_MS * 2, 60_000);
// Epoch ms of the last /api/apps request; 0 means no client has been seen.
let lastClientSeen = 0;

app.use(pageLoadLogger("dashboard"));
app.use(express.static(PUBLIC_DIR));

/** Build the current merged app list (discovery is cheap; re-run per request). */
async function buildApps(): Promise<AppEntry[]> {
  const discovered = await discoverApps(config);
  return mergeApps(discovered, config);
}

app.get("/api/apps", async (_req, res) => {
  try {
    lastClientSeen = Date.now();
    const apps = await buildApps();
    const hostAddress = config.settings.hostAddress;
    // A freshly-opened dashboard (or one returning after an idle gap) may find a
    // stale cache; probe now so the first render shows current status.
    if (isHealthStale(apps, hostAddress, HEALTH_INTERVAL_MS)) {
      await refreshHealth(apps, hostAddress);
    }
    const enriched = apps.map((a) => {
      const { status, lastChecked } = getStatus(healthTarget(a, hostAddress));
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
    res.json({ title: config.settings.title, apps: enriched });
  } catch (err) {
    console.error(`[api] /api/apps failed: ${(err as Error).message}`);
    res.status(500).json({ error: "Failed to build app list" });
  }
});

app.get("/healthz", (_req, res) => res.json({ ok: true }));

// Serve the dashboard shell for the root.
app.get("/", (_req, res) => res.sendFile(join(PUBLIC_DIR, "index.html")));

async function healthLoop(): Promise<void> {
  // Skip probing when nobody is watching — no client has fetched /api/apps
  // within the active window. This keeps the dashboard from hammering every app
  // (and flooding their access logs) around the clock. An on-demand probe in
  // /api/apps covers the moment a client returns.
  if (Date.now() - lastClientSeen > ACTIVE_WINDOW_MS) return;
  try {
    const apps = await buildApps();
    await refreshHealth(apps, config.settings.hostAddress);
  } catch (err) {
    console.error(`[health] refresh failed: ${(err as Error).message}`);
  }
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[server] ${config.settings.title} listening on http://0.0.0.0:${PORT}`);
  console.log(
    `[server] autoDiscover=${config.settings.autoDiscover} hostAddress=${config.settings.hostAddress}`,
  );
  // Poll on the configured interval, but only probe while a client is watching
  // (see healthLoop). No startup probe — it waits for the first client.
  setInterval(healthLoop, HEALTH_INTERVAL_MS);
});
