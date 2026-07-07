import { createApp, startServer } from "../Common/server-kit/app.ts";
import { firstStr, csvList, clampInt } from "../Common/http-utils/index.ts";
import { readAll } from "./lib/ingest.ts";
import type { AccessLogEntry, AppLogEntry } from "./lib/ingest.ts";
import { filterEntries, computeStats, filterAppLogs, computeLogStats } from "./lib/aggregate.ts";
import type { LogFilter, StatusClass, AppLogFilter, LogLevel } from "./lib/aggregate.ts";

const app = createApp("log-viewer");
// Root under which each app's log dir/volume is mounted. In dev, point this at
// the repo's apps/ folder (recursive scan finds each apps/<name>/logs/).
const LOGS_ROOT = process.env.LOGS_ROOT || "/logs";
// Re-ingest on an interval; new requests show up within one cycle.
const REFRESH_INTERVAL_MS = 15_000;

// In-memory view of the parsed logs, rebuilt periodically (see refresh()).
// `entries` holds HTTP access records; `logs` holds application (console) records.
let entries: AccessLogEntry[] = [];
let logs: AppLogEntry[] = [];
let lastRefresh: string | null = null;

async function refresh(): Promise<void> {
  try {
    const parsed = await readAll(LOGS_ROOT);
    entries = parsed.requests;
    logs = parsed.logs;
    lastRefresh = new Date().toISOString();
  } catch (err) {
    console.error(`[ingest] refresh failed: ${(err as Error).message}`);
  }
}

// ---- request-param helpers ------------------------------------------------

const STATUS_CLASSES = new Set<StatusClass>(["2xx", "3xx", "4xx", "5xx"]);

function parseFilter(query: Record<string, unknown>): LogFilter {
  const status = firstStr(query.status);
  return {
    app: csvList(query.app),
    method: csvList(query.method).map((m) => m.toUpperCase()),
    statusClass: csvList(query.statusClass).filter((c): c is StatusClass =>
      STATUS_CLASSES.has(c as StatusClass),
    ),
    status: status !== undefined && Number.isFinite(Number(status)) ? Number(status) : undefined,
    q: firstStr(query.q),
    from: firstStr(query.from),
    to: firstStr(query.to),
    excludeApp: csvList(query.excludeApp),
    excludeUa: csvList(query.excludeUa),
  };
}

type SortField = "ts" | "durationMs" | "status" | "app";
const SORT_FIELDS = new Set<SortField>(["ts", "durationMs", "status", "app"]);

/** entries are stored ts-desc; only re-sort when a different order is asked. */
function sortEntries(list: AccessLogEntry[], field: SortField, dir: "asc" | "desc") {
  if (field === "ts" && dir === "desc") return list; // already in this order
  const mult = dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    const av = a[field] ?? "";
    const bv = b[field] ?? "";
    return av < bv ? -mult : av > bv ? mult : 0;
  });
}

const LOG_LEVELS = new Set<LogLevel>(["log", "info", "warn", "error", "debug"]);

function parseLogFilter(query: Record<string, unknown>): AppLogFilter {
  return {
    app: csvList(query.app),
    level: csvList(query.level).filter((l): l is LogLevel => LOG_LEVELS.has(l as LogLevel)),
    q: firstStr(query.q),
    from: firstStr(query.from),
    to: firstStr(query.to),
    excludeApp: csvList(query.excludeApp),
  };
}

type LogSortField = "ts" | "level" | "app";
const LOG_SORT_FIELDS = new Set<LogSortField>(["ts", "level", "app"]);

/** logs are stored ts-desc; only re-sort when a different order is asked. */
function sortLogs(list: AppLogEntry[], field: LogSortField, dir: "asc" | "desc") {
  if (field === "ts" && dir === "desc") return list; // already in this order
  const mult = dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    const av = a[field] ?? "";
    const bv = b[field] ?? "";
    return av < bv ? -mult : av > bv ? mult : 0;
  });
}

// ---- API ------------------------------------------------------------------

app.get("/api/logs", (req, res) => {
  const filtered = filterEntries(entries, parseFilter(req.query));

  const [rawField, rawDir] = (firstStr(req.query.sort) || "ts:desc").split(":");
  const field = SORT_FIELDS.has(rawField as SortField) ? (rawField as SortField) : "ts";
  const dir: "asc" | "desc" = rawDir === "asc" ? "asc" : "desc";
  const sorted = sortEntries(filtered, field, dir);

  const limit = clampInt(firstStr(req.query.limit), { min: 1, max: 1000, fallback: 100 });
  const offset = clampInt(firstStr(req.query.offset), { min: 0, fallback: 0 });

  res.json({
    total: sorted.length,
    limit,
    offset,
    lastRefresh,
    entries: sorted.slice(offset, offset + limit),
  });
});

app.get("/api/stats", (req, res) => {
  const filtered = filterEntries(entries, parseFilter(req.query));
  res.json({ lastRefresh, stats: computeStats(filtered) });
});

app.get("/api/meta", (_req, res) => {
  const apps = new Set<string>();
  const methods = new Set<string>();
  let min: string | null = null;
  let max: string | null = null;
  for (const e of entries) {
    apps.add(e.app);
    if (e.method) methods.add(e.method);
    if (min === null || e.ts < min) min = e.ts;
    if (max === null || e.ts > max) max = e.ts;
  }
  res.json({
    apps: [...apps].sort(),
    methods: [...methods].sort(),
    count: entries.length,
    from: min,
    to: max,
    lastRefresh,
  });
});

// ---- application-log API (mirrors the request API above) ------------------

app.get("/api/app-logs", (req, res) => {
  const filtered = filterAppLogs(logs, parseLogFilter(req.query));

  const [rawField, rawDir] = (firstStr(req.query.sort) || "ts:desc").split(":");
  const field = LOG_SORT_FIELDS.has(rawField as LogSortField) ? (rawField as LogSortField) : "ts";
  const dir: "asc" | "desc" = rawDir === "asc" ? "asc" : "desc";
  const sorted = sortLogs(filtered, field, dir);

  const limit = clampInt(firstStr(req.query.limit), { min: 1, max: 1000, fallback: 100 });
  const offset = clampInt(firstStr(req.query.offset), { min: 0, fallback: 0 });

  res.json({
    total: sorted.length,
    limit,
    offset,
    lastRefresh,
    entries: sorted.slice(offset, offset + limit),
  });
});

app.get("/api/app-logs/stats", (req, res) => {
  const filtered = filterAppLogs(logs, parseLogFilter(req.query));
  res.json({ lastRefresh, stats: computeLogStats(filtered) });
});

app.get("/api/app-logs/meta", (_req, res) => {
  const apps = new Set<string>();
  const levels = new Set<LogLevel>();
  let min: string | null = null;
  let max: string | null = null;
  for (const e of logs) {
    apps.add(e.app);
    levels.add(e.level);
    if (min === null || e.ts < min) min = e.ts;
    if (max === null || e.ts > max) max = e.ts;
  }
  res.json({
    apps: [...apps].sort(),
    levels: [...levels].sort(),
    count: logs.length,
    from: min,
    to: max,
    lastRefresh,
  });
});

startServer(app, {
  name: "log-viewer",
  port: Number(process.env.PORT) || 6004,
  onListen: async () => {
    console.log(`log-viewer LOGS_ROOT=${LOGS_ROOT}`);
    await refresh();
    console.log(`[ingest] loaded ${entries.length} requests, ${logs.length} app-log entries`);
    setInterval(refresh, REFRESH_INTERVAL_MS);
  },
});
