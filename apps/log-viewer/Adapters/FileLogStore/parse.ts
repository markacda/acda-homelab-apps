import type { AccessLogEntry, AppLogEntry, ExceptionLogEntry, DependencyLogEntry } from '../../Domain/ValueObjects/log-entry.ts';
import type { ParsedLogs } from '../../Ports/LogStore/log-store.ts';

// Pure JSON-Lines parsing for the structured logs every app writes. Each app
// persists to its own directory under LOGS_ROOT, but the `app` field is embedded
// in every entry, so we classify each line by shape, not by filename.

// Bound memory on the Pi: keep only the most-recent N entries after sorting.
export const MAX_ENTRIES = 200_000;

// The exception + dependency records carry a `kind` discriminator; the request +
// app-log records predate it and have none, so they're matched by shape. Each
// guard takes the raw parsed object (fields typed loosely for the checks).
type Rec = Record<string, unknown>;

function isExceptionEntry(v: Rec): v is Rec & ExceptionLogEntry {
  return (
    v.kind === 'exception' &&
    typeof v.ts === 'string' &&
    typeof v.app === 'string' &&
    typeof v.name === 'string' &&
    typeof v.message === 'string' &&
    typeof v.source === 'string'
  );
}

function isDependencyEntry(v: Rec): v is Rec & DependencyLogEntry {
  return (
    v.kind === 'dependency' &&
    typeof v.ts === 'string' &&
    typeof v.app === 'string' &&
    typeof v.type === 'string' &&
    typeof v.target === 'string' &&
    typeof v.name === 'string' &&
    typeof v.durationMs === 'number' &&
    typeof v.success === 'boolean'
  );
}

// A 3xx isn't a failure — installFetchLogging records success = res.ok, which is
// false for a redirect (e.g. the dashboard's health probes saw 302s before they
// were pointed at /healthz). Treat any recorded 3xx as OK here so it doesn't inflate
// the Dependencies failure rate, retroactively for already-written records too. The
// stored `status` is kept intact, so the status pill still shows the real code (#186).
function normalizeDependency(e: DependencyLogEntry): DependencyLogEntry {
  if (!e.success && typeof e.status === 'number' && e.status >= 300 && e.status < 400) {
    return { ...e, success: true };
  }
  return e;
}

// A request entry needs ts + numeric status.
function isRequestEntry(v: Rec): v is Rec & AccessLogEntry {
  return typeof v.ts === 'string' && typeof v.status === 'number';
}

// An app-log entry needs ts + string level + string message (no status).
function isAppLogEntry(v: Rec): v is Rec & AppLogEntry {
  return typeof v.ts === 'string' && typeof v.level === 'string' && typeof v.message === 'string';
}

/** Parse JSON-Lines text into all four record kinds, skipping blank/malformed lines. */
export function parseAll(text: string): ParsedLogs {
  const requests: AccessLogEntry[] = [];
  const logs: AppLogEntry[] = [];
  const exceptions: ExceptionLogEntry[] = [];
  const dependencies: DependencyLogEntry[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed !== 'object' || parsed === null) continue;
      const v = parsed as Rec;
      if (isExceptionEntry(v)) exceptions.push(v);
      else if (isDependencyEntry(v)) dependencies.push(normalizeDependency(v));
      else if (isRequestEntry(v)) requests.push(v);
      else if (isAppLogEntry(v)) logs.push(v);
    } catch {
      // Tolerate partial trailing writes and other malformed lines.
    }
  }
  return { requests, logs, exceptions, dependencies };
}

/** Parse JSON-Lines text, returning only request (access-log) entries. */
export function parseLines(text: string): AccessLogEntry[] {
  return parseAll(text).requests;
}

/** Sort ts-descending (newest first) and cap to the most-recent `cap` entries. */
export function sortAndCap<T extends { ts: string }>(all: T[], cap: number): T[] {
  all.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  return all.length > cap ? all.slice(0, cap) : all;
}
