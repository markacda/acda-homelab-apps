import express from "express";
import { join } from "node:path";
import { pageLoadLogger } from "../../packages/access-log/logger.ts";
import { readAllEntries } from "./lib/ingest.ts";
import type { AccessLogEntry } from "./lib/ingest.ts";
import { filterEntries, computeStats } from "./lib/aggregate.ts";
import type { LogFilter, StatusClass } from "./lib/aggregate.ts";

const app = express();
const PORT = Number(process.env.PORT) || 6004;
// Root under which each app's log dir/volume is mounted. In dev, point this at
// the repo's apps/ folder (recursive scan finds each apps/<name>/logs/).
const LOGS_ROOT = process.env.LOGS_ROOT || "/logs";
// Re-ingest on an interval; new requests show up within one cycle.
const REFRESH_INTERVAL_MS = 15_000;

app.use(pageLoadLogger("log-viewer"));

// In-memory view of the parsed logs, rebuilt periodically (see refresh()).
let entries: AccessLogEntry[] = [];
let lastRefresh: string | null = null;

async function refresh(): Promise<void> {
  try {
    entries = await readAllEntries(LOGS_ROOT);
    lastRefresh = new Date().toISOString();
  } catch (err) {
    console.error(`[ingest] refresh failed: ${(err as Error).message}`);
  }
}

// ---- request-param helpers ------------------------------------------------

/** First string value of a query param, or undefined. */
function str(v: unknown): string | undefined {
  if (Array.isArray(v)) v = v[0];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** Split a comma-separated query param into a de-duped, non-empty string array. */
function list(v: unknown): string[] {
  const raw = str(v);
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    ),
  ];
}

const STATUS_CLASSES = new Set<StatusClass>(["2xx", "3xx", "4xx", "5xx"]);

function parseFilter(query: Record<string, unknown>): LogFilter {
  const status = str(query.status);
  return {
    app: list(query.app),
    method: list(query.method).map((m) => m.toUpperCase()),
    statusClass: list(query.statusClass).filter((c): c is StatusClass =>
      STATUS_CLASSES.has(c as StatusClass),
    ),
    status: status !== undefined && Number.isFinite(Number(status)) ? Number(status) : undefined,
    q: str(query.q),
    from: str(query.from),
    to: str(query.to),
    excludeApp: list(query.excludeApp),
    excludeUa: list(query.excludeUa),
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

// ---- API ------------------------------------------------------------------

app.get("/api/logs", (req, res) => {
  const filtered = filterEntries(entries, parseFilter(req.query));

  const [rawField, rawDir] = (str(req.query.sort) || "ts:desc").split(":");
  const field = SORT_FIELDS.has(rawField as SortField) ? (rawField as SortField) : "ts";
  const dir: "asc" | "desc" = rawDir === "asc" ? "asc" : "desc";
  const sorted = sortEntries(filtered, field, dir);

  const limit = Math.min(Math.max(Number(str(req.query.limit)) || 100, 1), 1000);
  const offset = Math.max(Number(str(req.query.offset)) || 0, 0);

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

app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

// public/ resolves from the app root (cwd) — true both in dev (npm runs from
// the app dir) and in Docker (WORKDIR /app).
app.use(express.static(join(process.cwd(), "public")));

app.listen(PORT, "0.0.0.0", async () => {
  console.log(`log-viewer listening on http://0.0.0.0:${PORT} (LOGS_ROOT=${LOGS_ROOT})`);
  await refresh();
  console.log(`[ingest] loaded ${entries.length} entries`);
  setInterval(refresh, REFRESH_INTERVAL_MS);
});
