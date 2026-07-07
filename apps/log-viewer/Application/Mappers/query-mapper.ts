import { firstStr, csvList, clampInt } from "../../../Common/http-utils/index.ts";
import type { LogFilter, AppLogFilter } from "../../Domain/ValueObjects/log-filter.ts";
import type { StatusClass, LogLevel } from "../../Domain/ValueObjects/log-entry.ts";
import type {
  RequestSortField,
  AppLogSortField,
  SortSpec,
  Pagination,
} from "../../Models/Requests/log-query.ts";

// Translate raw HTTP query params into the domain filter specs and the
// sort/pagination the query service applies. Pure coercion; unknown values fall
// back to sensible defaults.

type Query = Record<string, unknown>;

const STATUS_CLASSES = new Set<StatusClass>(["2xx", "3xx", "4xx", "5xx"]);
const LOG_LEVELS = new Set<LogLevel>(["log", "info", "warn", "error", "debug"]);
const REQUEST_SORT_FIELDS = new Set<RequestSortField>(["ts", "durationMs", "status", "app"]);
const APP_LOG_SORT_FIELDS = new Set<AppLogSortField>(["ts", "level", "app"]);

export function parseRequestFilter(query: Query): LogFilter {
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

export function parseAppLogFilter(query: Query): AppLogFilter {
  return {
    app: csvList(query.app),
    level: csvList(query.level).filter((l): l is LogLevel => LOG_LEVELS.has(l as LogLevel)),
    q: firstStr(query.q),
    from: firstStr(query.from),
    to: firstStr(query.to),
    excludeApp: csvList(query.excludeApp),
  };
}

function parseSort<F>(raw: string | undefined, valid: Set<F>, fallback: F): SortSpec<F> {
  const [rawField, rawDir] = (raw || "ts:desc").split(":");
  const field = valid.has(rawField as F) ? (rawField as F) : fallback;
  return { field, dir: rawDir === "asc" ? "asc" : "desc" };
}

export function parseRequestSort(query: Query): SortSpec<RequestSortField> {
  return parseSort(firstStr(query.sort), REQUEST_SORT_FIELDS, "ts");
}

export function parseAppLogSort(query: Query): SortSpec<AppLogSortField> {
  return parseSort(firstStr(query.sort), APP_LOG_SORT_FIELDS, "ts");
}

export function parsePagination(query: Query): Pagination {
  return {
    limit: clampInt(firstStr(query.limit), { min: 1, max: 1000, fallback: 100 }),
    offset: clampInt(firstStr(query.offset), { min: 0, fallback: 0 }),
  };
}
