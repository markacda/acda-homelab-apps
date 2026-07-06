import { readdir, readFile, stat } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import type { AccessLogEntry } from "../../../packages/access-log/logger.ts";

// Reads the structured access logs written by every app. Each app persists its
// log to its own directory under LOGS_ROOT (in Docker, one read-only volume per
// app); the active file plus daily-rotated, gzipped history all live there.
// The `app` field is embedded in every entry, so the directory layout is only a
// mounting convenience — we simply scan LOGS_ROOT recursively for log files.

export type { AccessLogEntry };

// Bound memory on the Pi: keep only the most-recent N entries after sorting.
export const MAX_ENTRIES = 200_000;

// A parsed log entry may miss optional fields; only ts + status are required to
// be considered a valid record.
function isEntry(v: unknown): v is AccessLogEntry {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as AccessLogEntry).ts === "string" &&
    typeof (v as AccessLogEntry).status === "number"
  );
}

/** Parse JSON-Lines text, skipping blank or malformed lines. */
export function parseLines(text: string): AccessLogEntry[] {
  const out: AccessLogEntry[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (isEntry(parsed)) out.push(parsed);
    } catch {
      // Tolerate partial trailing writes and other malformed lines.
    }
  }
  return out;
}

// Cache parsed files by path; a file is re-read only when its size/mtime change.
// Rotated .gz files are immutable so they parse exactly once; the active
// access.log is re-read as it grows.
interface CacheItem {
  mtimeMs: number;
  size: number;
  entries: AccessLogEntry[];
}
const fileCache = new Map<string, CacheItem>();

/** Recursively collect every regular file under `root`. Returns [] if missing. */
async function listFiles(root: string): Promise<string[]> {
  let dirents;
  try {
    dirents = await readdir(root, { withFileTypes: true });
  } catch {
    return []; // root not mounted / does not exist yet
  }
  const files: string[] = [];
  for (const d of dirents) {
    const full = join(root, d.name);
    if (d.isDirectory()) files.push(...(await listFiles(full)));
    else if (d.isFile()) files.push(full);
  }
  return files;
}

async function readFileEntries(path: string): Promise<AccessLogEntry[]> {
  let info;
  try {
    info = await stat(path);
  } catch {
    fileCache.delete(path);
    return [];
  }
  const cached = fileCache.get(path);
  if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) {
    return cached.entries;
  }
  let text: string;
  try {
    const buf = await readFile(path);
    text = path.endsWith(".gz") ? gunzipSync(buf).toString("utf8") : buf.toString("utf8");
  } catch {
    return [];
  }
  const entries = parseLines(text);
  fileCache.set(path, { mtimeMs: info.mtimeMs, size: info.size, entries });
  return entries;
}

/**
 * Read and parse every log file under `root`, returning entries sorted by
 * timestamp descending and capped at `cap` (most-recent kept).
 */
export async function readAllEntries(
  root: string,
  cap: number = MAX_ENTRIES,
): Promise<AccessLogEntry[]> {
  const files = await listFiles(root);
  const all: AccessLogEntry[] = [];
  for (const f of files) all.push(...(await readFileEntries(f)));
  all.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  return all.length > cap ? all.slice(0, cap) : all;
}
