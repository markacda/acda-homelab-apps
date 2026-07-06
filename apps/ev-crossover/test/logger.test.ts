import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEntry } from "../lib/logger.ts";

// Minimal req/res doubles — buildEntry only reads these fields.
function fakeReq(overrides = {}) {
  return {
    method: "GET",
    originalUrl: "/index.html",
    ip: "10.0.0.5",
    socket: { remoteAddress: "10.0.0.5" },
    headers: { "user-agent": "curl/8.0", referer: "http://host/" },
    ...overrides,
  };
}

function fakeRes(overrides = {}) {
  return {
    statusCode: 200,
    getHeader: (name: string) => (name === "content-length" ? "1234" : undefined),
    ...overrides,
  };
}

test("buildEntry captures the structured page-load fields", () => {
  const entry = buildEntry(
    fakeReq(),
    fakeRes(),
    12.345,
    "ev-crossover",
    "2026-07-06T00:00:00.000Z",
  );
  assert.deepEqual(entry, {
    ts: "2026-07-06T00:00:00.000Z",
    app: "ev-crossover",
    method: "GET",
    url: "/index.html",
    status: 200,
    durationMs: 12.345,
    ip: "10.0.0.5",
    ua: "curl/8.0",
    referer: "http://host/",
    bytes: 1234,
  });
});

test("buildEntry tolerates missing optional fields", () => {
  const req = fakeReq({ ip: undefined, socket: {}, headers: {} });
  const res = fakeRes({ statusCode: 404, getHeader: () => undefined });
  const entry = buildEntry(req, res, 0, "ev-crossover", "2026-07-06T00:00:00.000Z");
  assert.equal(entry.status, 404);
  assert.equal(entry.ip, null);
  assert.equal(entry.ua, null);
  assert.equal(entry.referer, null);
  assert.equal(entry.bytes, null);
});
