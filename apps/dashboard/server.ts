import express from "express";
import { join } from "node:path";

import { loadConfig, mergeApps } from "./lib/config.ts";
import type { AppEntry } from "./lib/config.ts";
import { discoverApps } from "./lib/discovery.ts";
import { refreshHealth, getStatus, healthTarget } from "./lib/health.ts";
import { pageLoadLogger } from "./lib/logger.ts";

// public/ resolves from the app root (cwd) — true both in dev (npm runs from
// the app dir) and in Docker (WORKDIR /app) — so it works whether we run
// server.ts directly or the compiled dist/server.js.
const PUBLIC_DIR = join(process.cwd(), "public");
const PORT = Number(process.env.PORT) || 8080;

const config = loadConfig();
const app = express();

app.use(pageLoadLogger("dashboard"));
app.use(express.static(PUBLIC_DIR));

/** Build the current merged app list (discovery is cheap; re-run per request). */
async function buildApps(): Promise<AppEntry[]> {
  const discovered = await discoverApps(config);
  return mergeApps(discovered, config);
}

app.get("/api/apps", async (_req, res) => {
  try {
    const apps = await buildApps();
    const hostAddress = config.settings.hostAddress;
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
  // Initial pass, then poll on the configured interval.
  healthLoop();
  setInterval(healthLoop, config.settings.healthCheckIntervalSeconds * 1000);
});
