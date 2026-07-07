import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { parseLines, parseAll } from "../Adapters/FileLogStore/parse.ts";
import { FileLogStore } from "../Adapters/FileLogStore/file-log-store.ts";
import type { AccessLogEntry, AppLogEntry } from "../Domain/ValueObjects/log-entry.ts";

function entry(over: Partial<AccessLogEntry>): AccessLogEntry {
  return {
    ts: "2026-07-06T10:00:00.000Z",
    app: "atc",
    method: "GET",
    url: "/",
    status: 200,
    durationMs: 5,
    ip: "127.0.0.1",
    ua: "curl",
    referer: null,
    bytes: 100,
    ...over,
  };
}

test("parseLines skips blank and malformed lines", () => {
  const good = entry({ url: "/a" });
  const text = [JSON.stringify(good), "", "   ", "{not json", '{"ts":"x"}' /* no status */].join(
    "\n",
  );
  const out = parseLines(text);
  assert.equal(out.length, 1);
  assert.equal(out[0].url, "/a");
});

test("readAllEntries reads plain + gzipped files recursively, sorted ts desc", async () => {
  const root = await mkdtemp(join(tmpdir(), "logview-"));
  await mkdir(join(root, "atc"), { recursive: true });
  await mkdir(join(root, "ev-crossover"), { recursive: true });

  const active = entry({ app: "atc", ts: "2026-07-06T12:00:00.000Z", url: "/new" });
  await writeFile(join(root, "atc", "access.log"), JSON.stringify(active) + "\n");

  // Rotated + gzipped history in another app's dir.
  const older = entry({ app: "ev-crossover", ts: "2026-07-05T09:00:00.000Z", url: "/old" });
  await writeFile(
    join(root, "ev-crossover", "access.log.1.gz"),
    gzipSync(Buffer.from(JSON.stringify(older) + "\n")),
  );

  const all = await new FileLogStore(root).readAllEntries();
  assert.equal(all.length, 2);
  // Newest first.
  assert.equal(all[0].url, "/new");
  assert.equal(all[1].url, "/old");
});

test("readAllEntries returns [] when root is missing", async () => {
  const all = await new FileLogStore(join(tmpdir(), "does-not-exist-logview-xyz")).readAllEntries();
  assert.deepEqual(all, []);
});

function appLog(over: Partial<AppLogEntry>): AppLogEntry {
  return {
    ts: "2026-07-06T10:00:00.000Z",
    app: "atc",
    level: "info",
    message: "hello",
    params: [],
    ...over,
  };
}

test("parseAll splits request and app-log lines by shape", () => {
  const req = entry({ url: "/a" });
  const log = appLog({ level: "error", message: "boom" });
  const text = [
    JSON.stringify(req),
    JSON.stringify(log),
    "", // blank
    "{not json",
    '{"ts":"x"}', // neither shape (no status, no level/message)
  ].join("\n");
  const { requests, logs } = parseAll(text);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "/a");
  assert.equal(logs.length, 1);
  assert.equal(logs[0].message, "boom");
  assert.equal(logs[0].level, "error");
});

test("readAll returns both kinds, each sorted ts desc, from mixed files", async () => {
  const root = await mkdtemp(join(tmpdir(), "logview-mixed-"));
  await mkdir(join(root, "atc"), { recursive: true });

  const req = entry({ app: "atc", ts: "2026-07-06T12:00:00.000Z", url: "/new" });
  await writeFile(join(root, "atc", "access.log"), JSON.stringify(req) + "\n");

  const olderLog = appLog({ app: "atc", ts: "2026-07-06T09:00:00.000Z", message: "old" });
  const newerLog = appLog({ app: "atc", ts: "2026-07-06T11:00:00.000Z", message: "new" });
  await writeFile(
    join(root, "atc", "app.log"),
    JSON.stringify(olderLog) + "\n" + JSON.stringify(newerLog) + "\n",
  );

  const { requests, logs } = await new FileLogStore(root).readAll();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "/new");
  assert.equal(logs.length, 2);
  assert.equal(logs[0].message, "new"); // newest first
  assert.equal(logs[1].message, "old");
});

test("parseLines still returns only request entries (back-compat)", () => {
  const text = [JSON.stringify(entry({ url: "/x" })), JSON.stringify(appLog({}))].join("\n");
  const out = parseLines(text);
  assert.equal(out.length, 1);
  assert.equal(out[0].url, "/x");
});
