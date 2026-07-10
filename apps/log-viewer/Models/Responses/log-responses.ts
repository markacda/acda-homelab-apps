import type { LogLevel } from '../../Domain/ValueObjects/log-entry.ts';

/** Paginated list of log entries (either kind). */
export interface LogListResponse<T> {
  total: number;
  limit: number;
  offset: number;
  lastRefresh: string | null;
  entries: T[];
}

/** GET /api/meta — the facets available across the loaded access-log entries. */
export interface RequestMeta {
  apps: string[];
  methods: string[];
  count: number;
  from: string | null;
  to: string | null;
  lastRefresh: string | null;
}

/** GET /api/app-logs/meta — the facets available across the loaded app-log entries. */
export interface AppLogMeta {
  apps: string[];
  levels: LogLevel[];
  count: number;
  from: string | null;
  to: string | null;
  lastRefresh: string | null;
}
