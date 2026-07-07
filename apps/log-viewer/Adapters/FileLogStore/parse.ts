import type { AccessLogEntry, AppLogEntry } from "../../Domain/ValueObjects/log-entry.ts";
import type { ParsedLogs } from "../../Ports/LogStore/log-store.ts";

// Pure JSON-Lines parsing for the structured logs every app writes. Each app
// persists to its own directory under LOGS_ROOT, but the `app` field is embedded
// in every entry, so we classify each line by shape, not by filename.

// Bound memory on the Pi: keep only the most-recent N entries after sorting.
export const MAX_ENTRIES = 200_000;

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

/** Sort ts-descending (newest first) and cap to the most-recent `cap` entries. */
export function sortAndCap<T extends { ts: string }>(all: T[], cap: number): T[] {
  all.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  return all.length > cap ? all.slice(0, cap) : all;
}
