import { firstStr, csvList, clampInt } from '../../../Common/http-utils/index.ts';
import type { LogFilter, AppLogFilter, ExceptionFilter, DependencyFilter } from '../../Domain/ValueObjects/log-filter.ts';
import type { StatusClass, LogLevel, ExceptionSource, DependencyType } from '../../Domain/ValueObjects/log-entry.ts';
import type {
  RequestSortField,
  AppLogSortField,
  ExceptionSortField,
  DependencySortField,
  SortSpec,
  Pagination,
} from '../../Models/Requests/log-query.ts';

// Translate raw HTTP query params into the domain filter specs and the
// sort/pagination the query service applies. Pure coercion; unknown values fall
// back to sensible defaults.

type Query = Record<string, unknown>;

const STATUS_CLASSES = new Set<StatusClass>(['2xx', '3xx', '4xx', '5xx']);
const LOG_LEVELS = new Set<LogLevel>(['log', 'info', 'warn', 'error', 'debug']);
const EXCEPTION_SOURCES = new Set<ExceptionSource>(['express', 'uncaught', 'unhandledRejection', 'manual']);
const DEPENDENCY_TYPES = new Set<DependencyType>(['http', 'postgres']);
const REQUEST_SORT_FIELDS = new Set<RequestSortField>(['ts', 'durationMs', 'status', 'app']);
const APP_LOG_SORT_FIELDS = new Set<AppLogSortField>(['ts', 'level', 'app']);
const EXCEPTION_SORT_FIELDS = new Set<ExceptionSortField>(['ts', 'app', 'source', 'name']);
const DEPENDENCY_SORT_FIELDS = new Set<DependencySortField>(['ts', 'app', 'type', 'target', 'durationMs']);

export function parseRequestFilter(query: Query): LogFilter {
  const status = firstStr(query.status);
  return {
    app: csvList(query.app),
    method: csvList(query.method).map((m) => m.toUpperCase()),
    statusClass: csvList(query.statusClass).filter((c): c is StatusClass => STATUS_CLASSES.has(c as StatusClass)),
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
  const [rawField, rawDir] = (raw || 'ts:desc').split(':');
  const field = valid.has(rawField as F) ? (rawField as F) : fallback;
  return { field, dir: rawDir === 'asc' ? 'asc' : 'desc' };
}

export function parseExceptionFilter(query: Query): ExceptionFilter {
  return {
    app: csvList(query.app),
    source: csvList(query.source).filter((s): s is ExceptionSource => EXCEPTION_SOURCES.has(s as ExceptionSource)),
    q: firstStr(query.q),
    from: firstStr(query.from),
    to: firstStr(query.to),
    excludeApp: csvList(query.excludeApp),
  };
}

export function parseDependencyFilter(query: Query): DependencyFilter {
  const outcome = firstStr(query.outcome);
  return {
    app: csvList(query.app),
    type: csvList(query.type).filter((t): t is DependencyType => DEPENDENCY_TYPES.has(t as DependencyType)),
    target: csvList(query.target),
    outcome: outcome === 'success' || outcome === 'failure' ? outcome : undefined,
    q: firstStr(query.q),
    from: firstStr(query.from),
    to: firstStr(query.to),
    excludeApp: csvList(query.excludeApp),
  };
}

export function parseRequestSort(query: Query): SortSpec<RequestSortField> {
  return parseSort(firstStr(query.sort), REQUEST_SORT_FIELDS, 'ts');
}

export function parseAppLogSort(query: Query): SortSpec<AppLogSortField> {
  return parseSort(firstStr(query.sort), APP_LOG_SORT_FIELDS, 'ts');
}

export function parseExceptionSort(query: Query): SortSpec<ExceptionSortField> {
  return parseSort(firstStr(query.sort), EXCEPTION_SORT_FIELDS, 'ts');
}

export function parseDependencySort(query: Query): SortSpec<DependencySortField> {
  return parseSort(firstStr(query.sort), DEPENDENCY_SORT_FIELDS, 'ts');
}

export function parsePagination(query: Query): Pagination {
  return {
    limit: clampInt(firstStr(query.limit), { min: 1, max: 1000, fallback: 100 }),
    offset: clampInt(firstStr(query.offset), { min: 0, fallback: 0 }),
  };
}
