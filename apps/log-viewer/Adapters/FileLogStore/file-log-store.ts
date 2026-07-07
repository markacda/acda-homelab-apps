import { readdir, readFile, stat } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import type { LogStore, ParsedLogs } from "../../Ports/LogStore/log-store.ts";
import type { AccessLogEntry, AppLogEntry } from "../../Domain/ValueObjects/log-entry.ts";
import { parseAll, sortAndCap, MAX_ENTRIES } from "./parse.ts";

// Cache parsed files by path; a file is re-read only when its size/mtime change.
// Rotated .gz files are immutable so they parse exactly once; the active files
// (access.log + app.log) are re-read as they grow.
interface CacheItem {
  mtimeMs: number;
  size: number;
  parsed: ParsedLogs;
}

const EMPTY: ParsedLogs = { requests: [], logs: [] };

/**
 * LogStore backed by the filesystem: every app persists its logs to a directory
 * under `root` (in Docker, one read-only volume per app). Scans `root`
 * recursively, gunzips rotated history, and returns both record kinds sorted by
 * timestamp descending, each capped at `cap` (most-recent kept).
 */
export class FileLogStore implements LogStore {
  private root: string;
  private cap: number;
  private fileCache = new Map<string, CacheItem>();

  constructor(root: string, cap: number = MAX_ENTRIES) {
    this.root = root;
    this.cap = cap;
  }

  async readAll(): Promise<ParsedLogs> {
    const files = await this.listFiles(this.root);
    const requests: AccessLogEntry[] = [];
    const logs: AppLogEntry[] = [];
    for (const f of files) {
      const parsed = await this.readFileParsed(f);
      requests.push(...parsed.requests);
      logs.push(...parsed.logs);
    }
    return { requests: sortAndCap(requests, this.cap), logs: sortAndCap(logs, this.cap) };
  }

  /** Convenience for callers/tests that only want request (access-log) entries. */
  async readAllEntries(): Promise<AccessLogEntry[]> {
    return (await this.readAll()).requests;
  }

  /** Recursively collect every regular file under `root`. Returns [] if missing. */
  private async listFiles(root: string): Promise<string[]> {
    let dirents;
    try {
      dirents = await readdir(root, { withFileTypes: true });
    } catch {
      return []; // root not mounted / does not exist yet
    }
    const files: string[] = [];
    for (const d of dirents) {
      const full = join(root, d.name);
      if (d.isDirectory()) files.push(...(await this.listFiles(full)));
      else if (d.isFile()) files.push(full);
    }
    return files;
  }

  private async readFileParsed(path: string): Promise<ParsedLogs> {
    let info;
    try {
      info = await stat(path);
    } catch {
      this.fileCache.delete(path);
      return EMPTY;
    }
    const cached = this.fileCache.get(path);
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
    this.fileCache.set(path, { mtimeMs: info.mtimeMs, size: info.size, parsed });
    return parsed;
  }
}
