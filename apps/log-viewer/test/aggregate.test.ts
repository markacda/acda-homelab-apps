import { test } from "node:test";
import assert from "node:assert/strict";
import { filterEntries, computeStats } from "../lib/aggregate.ts";
import type { AccessLogEntry } from "../lib/ingest.ts";

function entry(over: Partial<AccessLogEntry>): AccessLogEntry {
  return {
    ts: "2026-07-06T10:00:00.000Z",
    app: "atc",
    method: "GET",
    url: "/",
    status: 200,
    durationMs: 10,
    ip: "10.0.0.1",
    ua: "curl",
    referer: null,
    bytes: 100,
    ...over,
  };
}

const sample: AccessLogEntry[] = [
  entry({ app: "atc", url: "/planes", status: 200, durationMs: 20, ts: "2026-07-06T10:00:00Z" }),
  entry({ app: "atc", url: "/planes", status: 500, durationMs: 40, ts: "2026-07-06T10:01:00Z" }),
  entry({ app: "ev", url: "/calc", status: 404, durationMs: 6, ts: "2026-07-06T10:02:00Z" }),
  entry({ app: "ev", url: "/calc", status: 200, durationMs: 4, ts: "2026-07-06T10:03:00Z" }),
];

test("filterEntries: by app", () => {
  assert.equal(filterEntries(sample, { app: "atc" }).length, 2);
});

test("filterEntries: by statusClass", () => {
  const errs = filterEntries(sample, { statusClass: "5xx" });
  assert.equal(errs.length, 1);
  assert.equal(errs[0].status, 500);
});

test("filterEntries: by q substring over url", () => {
  assert.equal(filterEntries(sample, { q: "PLANES" }).length, 2);
});

test("filterEntries: by time range (inclusive)", () => {
  const r = filterEntries(sample, { from: "2026-07-06T10:01:00Z", to: "2026-07-06T10:02:00Z" });
  assert.equal(r.length, 2);
});

test("computeStats: overall counts, avg and error rate", () => {
  const s = computeStats(sample);
  assert.equal(s.overall.count, 4);
  assert.equal(s.overall.avgDurationMs, 17.5); // (20+40+6+4)/4
  assert.equal(s.overall.errorCount, 2); // 500 + 404
  assert.equal(s.overall.count4xx, 1);
  assert.equal(s.overall.count5xx, 1);
  assert.equal(s.overall.errorRate, 0.5);
});

test("computeStats: perApp and perEndpoint aggregation", () => {
  const s = computeStats(sample);
  const atc = s.perApp.find((a) => a.app === "atc")!;
  assert.equal(atc.count, 2);
  assert.equal(atc.avgDurationMs, 30); // (20+40)/2
  assert.equal(atc.errorCount, 1);

  const planes = s.perEndpoint.find((e) => e.url === "/planes")!;
  assert.equal(planes.count, 2);
  assert.equal(planes.app, "atc");
  assert.equal(planes.method, "GET");
});

test("computeStats: status distribution sorted ascending", () => {
  const s = computeStats(sample);
  assert.deepEqual(
    s.statusDistribution.map((d) => d.status),
    [200, 404, 500],
  );
});
