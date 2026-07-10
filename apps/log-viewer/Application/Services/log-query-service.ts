import { LogIngestService } from './Background/log-ingest-service.ts';
import { filterEntries, computeStats, filterAppLogs, computeLogStats } from '../../Domain/Services/log-analytics.ts';
import type { AccessLogEntry, AppLogEntry } from '../../Domain/ValueObjects/log-entry.ts';
import type { LogFilter, AppLogFilter } from '../../Domain/ValueObjects/log-filter.ts';
import type { Stats, LogStats } from '../../Domain/ValueObjects/log-stats.ts';
import type { RequestSortField, AppLogSortField, SortSpec, Pagination } from '../../Models/Requests/log-query.ts';
import type { LogListResponse, RequestMeta, AppLogMeta } from '../../Models/Responses/log-responses.ts';

// Read model over the in-memory log view: filter (domain), sort, paginate, and
// aggregate. The view is stored ts-descending, so ts:desc needs no re-sort.
function sortByField<T extends AccessLogEntry | AppLogEntry, F extends keyof T & string>(list: T[], field: F, dir: 'asc' | 'desc'): T[] {
  if (field === 'ts' && dir === 'desc') return list;
  const mult = dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    const av = a[field] ?? '';
    const bv = b[field] ?? '';
    return av < bv ? -mult : av > bv ? mult : 0;
  });
}

export class LogQueryService {
  private ingest: LogIngestService;

  constructor(ingest: LogIngestService) {
    this.ingest = ingest;
  }

  listRequests(filter: LogFilter, sort: SortSpec<RequestSortField>, page: Pagination): LogListResponse<AccessLogEntry> {
    const filtered = filterEntries(this.ingest.getEntries(), filter);
    const sorted = sortByField(filtered, sort.field, sort.dir);
    return {
      total: sorted.length,
      limit: page.limit,
      offset: page.offset,
      lastRefresh: this.ingest.getLastRefresh(),
      entries: sorted.slice(page.offset, page.offset + page.limit),
    };
  }

  requestStats(filter: LogFilter): { lastRefresh: string | null; stats: Stats } {
    const filtered = filterEntries(this.ingest.getEntries(), filter);
    return { lastRefresh: this.ingest.getLastRefresh(), stats: computeStats(filtered) };
  }

  requestMeta(): RequestMeta {
    const apps = new Set<string>();
    const methods = new Set<string>();
    let min: string | null = null;
    let max: string | null = null;
    for (const e of this.ingest.getEntries()) {
      apps.add(e.app);
      if (e.method) methods.add(e.method);
      if (min === null || e.ts < min) min = e.ts;
      if (max === null || e.ts > max) max = e.ts;
    }
    return {
      apps: [...apps].sort(),
      methods: [...methods].sort(),
      count: this.ingest.getEntries().length,
      from: min,
      to: max,
      lastRefresh: this.ingest.getLastRefresh(),
    };
  }

  listAppLogs(filter: AppLogFilter, sort: SortSpec<AppLogSortField>, page: Pagination): LogListResponse<AppLogEntry> {
    const filtered = filterAppLogs(this.ingest.getLogs(), filter);
    const sorted = sortByField(filtered, sort.field, sort.dir);
    return {
      total: sorted.length,
      limit: page.limit,
      offset: page.offset,
      lastRefresh: this.ingest.getLastRefresh(),
      entries: sorted.slice(page.offset, page.offset + page.limit),
    };
  }

  appLogStats(filter: AppLogFilter): { lastRefresh: string | null; stats: LogStats } {
    const filtered = filterAppLogs(this.ingest.getLogs(), filter);
    return { lastRefresh: this.ingest.getLastRefresh(), stats: computeLogStats(filtered) };
  }

  appLogMeta(): AppLogMeta {
    const apps = new Set<string>();
    const levels = new Set<AppLogEntry['level']>();
    let min: string | null = null;
    let max: string | null = null;
    for (const e of this.ingest.getLogs()) {
      apps.add(e.app);
      levels.add(e.level);
      if (min === null || e.ts < min) min = e.ts;
      if (max === null || e.ts > max) max = e.ts;
    }
    return {
      apps: [...apps].sort(),
      levels: [...levels].sort(),
      count: this.ingest.getLogs().length,
      from: min,
      to: max,
      lastRefresh: this.ingest.getLastRefresh(),
    };
  }
}
