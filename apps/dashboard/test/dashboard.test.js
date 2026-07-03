import { test } from "node:test";
import assert from "node:assert/strict";

import { mergeApps } from "../lib/config.js";
import { healthTarget } from "../lib/health.js";

const baseConfig = { apps: [], overrides: {} };

test("mergeApps keeps discovered apps and applies overrides", () => {
  const discovered = [{ source: "docker", containerName: "sonarr", name: "sonarr", port: 8989 }];
  const config = { ...baseConfig, overrides: { sonarr: { name: "Sonarr", group: "Media" } } };
  const result = mergeApps(discovered, config);
  assert.equal(result.length, 1);
  assert.equal(result[0].name, "Sonarr");
  assert.equal(result[0].group, "Media");
});

test("mergeApps hides overridden containers", () => {
  const discovered = [{ source: "docker", containerName: "noisy", name: "noisy", port: 1234 }];
  const config = { ...baseConfig, overrides: { noisy: { hidden: true } } };
  assert.deepEqual(mergeApps(discovered, config), []);
});

test("mergeApps appends manual apps and dedupes by url", () => {
  const discovered = [{ source: "docker", name: "ha", url: "http://ha.local" }];
  const config = {
    ...baseConfig,
    apps: [
      { name: "Home Assistant", url: "http://ha.local" },
      { name: "Router", url: "http://192.168.1.1" },
    ],
  };
  const result = mergeApps(discovered, config);
  // The duplicate url is dropped, so ha + router = 2 entries.
  assert.equal(result.length, 2);
  assert.ok(result.some((a) => a.name === "Router"));
});

test("healthTarget prefers explicit url, then host+port", () => {
  assert.equal(healthTarget({ url: "http://x.local" }, "host.docker.internal"), "http://x.local");
  assert.equal(
    healthTarget({ port: 8123 }, "host.docker.internal"),
    "http://host.docker.internal:8123",
  );
  assert.equal(healthTarget({}, "host.docker.internal"), null);
});
