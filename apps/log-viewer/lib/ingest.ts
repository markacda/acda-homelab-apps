import { readdir, readFile, stat } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import type { AccessLogEntry, AppLogEntry } from "../../../packages/access-log/logger.ts";

// Reads the structured logs written by every app. Each app persists to its own
// directory under LOGS_ROOT (in Docker, one read-only volume per app); the
// active files (access.log + app.log) plus daily-rotated, gzipped history all
// live there. The `app` field is embedded in every entry, so the directory
// layout is only a mounting convenience — we scan LOGS_ROOT recursively and
// classify each JSON line by shape, not by filename.

export type { AccessLogEntry, AppLogEntry };

// Bound memory on the Pi: keep only the most-recent N entries after sorting.
export const MAX_ENTRIES = 200_000;

// Both record shapes together, split by kind.
export interface ParsedLogs {
  requests: AccessLogEntry[];
  logs: AppLogEntry[];
}

// A request entry needs ts + numeric status.
function isRequestEntry(v: unknown): v is AccessLogEntry {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as AccessLogEntry).ts === "string" &&
    typeof (v as AccessLogEntry).status === "number"
  );
}

// An app-log entry needs ts + string level + string message (no status).
function isAppLogEntry(v: unknown): v is AppLogEntry {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as AppLogEntry).ts === "string" &&
    typeof (v as AppLogEntry).level === "string" &&
    typeof (v as AppLogEntry).message === "string"
  );
}

/** Parse JSON-Lines text into both record kinds, skipping blank/malformed lines. */
export function parseAll(text: string): ParsedLogs {
  const requests: AccessLogEntry[] = [];
  const logs: AppLogEntry[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (isRequestEntry(parsed)) requests.push(parsed);
      else if (isAppLogEntry(parsed)) logs.push(parsed);
    } catch {
      // Tolerate partial trailing writes and other malformed lines.
    }
  }
  return { requests, logs };
}

/** Parse JSON-Lines text, returning only request (access-log) entries. */
export function parseLines(text: string): AccessLogEntry[] {
  return parseAll(text).requests;
}

// Cache parsed files by path; a file is re-read only when its size/mtime change.
// Rotated .gz files are immutable so they parse exactly once; the active files
// are re-read as they grow.
interface CacheItem {
  mtimeMs: number;
  size: number;
  parsed: ParsedLogs;
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

const EMPTY: ParsedLogs = { requests: [], logs: [] };

async function readFileParsed(path: string): Promise<ParsedLogs> {
  let info;
  try {
    info = await stat(path);
  } catch {
    fileCache.delete(path);
    return EMPTY;
  }
  const cached = fileCache.get(path);
  if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) {
    return cached.parsed;
  }
  let text: string;
  try {
    const buf = await readFile(path);
    text = path.endsWith(".gz") ? gunzipSync(buf).toString("utf8") : buf.toString("utf8");
  } catch {
    return EMPTY;
  }
  const parsed = parseAll(text);
  fileCache.set(path, { mtimeMs: info.mtimeMs, size: info.size, parsed });
  return parsed;
}

// Sort ts-descending (newest first) and cap to the most-recent `cap` entries.
function sortAndCap<T extends { ts: string }>(all: T[], cap: number): T[] {
  all.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  return all.length > cap ? all.slice(0, cap) : all;
}

/**
 * Read and parse every log file under `root` in a single pass, returning both
 * request and app-log entries sorted by timestamp descending, each capped at
 * `cap` (most-recent kept).
 */
export async function readAll(root: string, cap: number = MAX_ENTRIES): Promise<ParsedLogs> {
  const files = await listFiles(root);
  const requests: AccessLogEntry[] = [];
  const logs: AppLogEntry[] = [];
  for (const f of files) {
    const parsed = await readFileParsed(f);
    requests.push(...parsed.requests);
    logs.push(...parsed.logs);
  }
  return { requests: sortAndCap(requests, cap), logs: sortAndCap(logs, cap) };
}

/**
 * Read and parse every log file under `root`, returning request (access-log)
 * entries sorted by timestamp descending and capped at `cap`.
 */
export async function readAllEntries(
  root: string,
  cap: number = MAX_ENTRIES,
): Promise<AccessLogEntry[]> {
  return (await readAll(root, cap)).requests;
}
