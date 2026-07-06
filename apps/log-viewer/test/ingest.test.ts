import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { parseLines, readAllEntries } from "../lib/ingest.ts";
import type { AccessLogEntry } from "../lib/ingest.ts";

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

  const all = await readAllEntries(root);
  assert.equal(all.length, 2);
  // Newest first.
  assert.equal(all[0].url, "/new");
  assert.equal(all[1].url, "/old");
});

test("readAllEntries returns [] when root is missing", async () => {
  const all = await readAllEntries(join(tmpdir(), "does-not-exist-logview-xyz"));
  assert.deepEqual(all, []);
});
