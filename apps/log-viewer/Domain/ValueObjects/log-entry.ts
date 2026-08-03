// The log record shapes are owned by the shared @homelab/access-log package (the
// format every app writes). log-viewer's domain re-uses them as its core value
// objects and adds the small classifications it reasons about.
import type { AccessLogEntry, AppLogEntry, ExceptionLogEntry, DependencyLogEntry } from '../../../Common/access-log/logger.ts';

export type {
  AccessLogEntry,
  AppLogEntry,
  LogLevel,
  ExceptionLogEntry,
  ExceptionSource,
  DependencyLogEntry,
  DependencyType,
} from '../../../Common/access-log/logger.ts';

/** HTTP status grouped into its class. */
export type StatusClass = '2xx' | '3xx' | '4xx' | '5xx';

/** The three visual bands the app-log chart groups the five console levels into. */
export type LogBand = 'error' | 'warn' | 'info';

/**
 * One record on a trace timeline, tagged with its kind. Requests and app-logs
 * carry no `kind` field of their own (unlike exceptions/dependencies), so the
 * tag is added here to give the four kinds a single discriminated shape.
 */
export type TraceItem =
  | { kind: 'request'; entry: AccessLogEntry }
  | { kind: 'log'; entry: AppLogEntry }
  | { kind: 'exception'; entry: ExceptionLogEntry }
  | { kind: 'dependency'; entry: DependencyLogEntry };
