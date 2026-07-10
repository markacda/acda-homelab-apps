import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEntry, buildAppLogEntry } from "./logger.ts";

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
    getHeaders: () => ({ "content-type": "application/json", "content-length": "1234" }),
    ...overrides,
  };
}

test("buildEntry captures the structured page-load fields", () => {
  const entry = buildEntry(fakeReq(), fakeRes(), 12.345, "test-app", "2026-07-06T00:00:00.000Z");
  // A 2xx response records none of the response-headers/body fields.
  assert.deepEqual(entry, {
    ts: "2026-07-06T00:00:00.000Z",
    app: "test-app",
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
  const res = fakeRes({ statusCode: 404, getHeader: () => undefined, getHeaders: () => ({}) });
  const entry = buildEntry(req, res, 0, "test-app", "2026-07-06T00:00:00.000Z");
  assert.equal(entry.status, 404);
  assert.equal(entry.ip, null);
  assert.equal(entry.ua, null);
  assert.equal(entry.referer, null);
  assert.equal(entry.bytes, null);
});

test("buildEntry records headers + body for a non-2xx response, redacting secrets", () => {
  const res = fakeRes({
    statusCode: 500,
    getHeaders: () => ({
      "content-type": "application/json",
      "set-cookie": ["sid=secret; HttpOnly"],
      Authorization: "Bearer secret-token",
      "x-request-id": "abc",
    }),
  });
  const entry = buildEntry(
    fakeReq(),
    res,
    1,
    "test-app",
    "2026-07-06T00:00:00.000Z",
    '{"error":"boom"}',
  );
  assert.deepEqual(entry.resHeaders, {
    "content-type": "application/json",
    "set-cookie": "[redacted]", // case-insensitive key match
    Authorization: "[redacted]",
    "x-request-id": "abc",
  });
  assert.equal(entry.resBody, '{"error":"boom"}');
  assert.equal(entry.resBodyTruncated, undefined);
});

test("buildEntry flags a truncated non-2xx body", () => {
  const res = fakeRes({ statusCode: 502 });
  const entry = buildEntry(
    fakeReq(),
    res,
    1,
    "test-app",
    "2026-07-06T00:00:00.000Z",
    "partial",
    true,
  );
  assert.equal(entry.resBody, "partial");
  assert.equal(entry.resBodyTruncated, true);
});

test("buildEntry never records headers/body for a 2xx response even if a body is passed", () => {
  const entry = buildEntry(
    fakeReq(),
    fakeRes({ statusCode: 204 }),
    1,
    "test-app",
    "2026-07-06T00:00:00.000Z",
    "should be ignored",
    true,
  );
  assert.equal(entry.resHeaders, undefined);
  assert.equal(entry.resBody, undefined);
  assert.equal(entry.resBodyTruncated, undefined);
});

test("buildAppLogEntry formats a message and keeps structured params", () => {
  const entry = buildAppLogEntry(
    "info",
    ["Fetching %s (attempt %d)", "http://x/y", 2],
    "test-app",
    "2026-07-06T00:00:00.000Z",
  );
  assert.deepEqual(entry, {
    ts: "2026-07-06T00:00:00.000Z",
    app: "test-app",
    level: "info",
    message: "Fetching http://x/y (attempt 2)",
    params: ["Fetching %s (attempt %d)", "http://x/y", 2],
  });
});

test("buildAppLogEntry serializes Error args into name/message/stack", () => {
  const err = new Error("boom");
  const entry = buildAppLogEntry("error", ["calculate failed:", err], "test-app");
  assert.equal(entry.level, "error");
  assert.ok(entry.message.startsWith("calculate failed: Error: boom"));
  const serialized = entry.params[1] as { name: string; message: string; stack?: string };
  assert.equal(serialized.name, "Error");
  assert.equal(serialized.message, "boom");
  assert.equal(typeof serialized.stack, "string");
});

test("buildAppLogEntry keeps plain objects and tolerates circular refs", () => {
  const circular: Record<string, unknown> = { a: 1 };
  circular.self = circular;
  const entry = buildAppLogEntry(
    "log",
    [{ ok: true }, circular],
    "test-app",
    "2026-07-06T00:00:00.000Z",
  );
  assert.deepEqual(entry.params[0], { ok: true });
  assert.equal(typeof entry.params[1], "string"); // circular -> best-effort string
});
