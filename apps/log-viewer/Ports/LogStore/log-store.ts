import type { AccessLogEntry, AppLogEntry } from '../../Domain/ValueObjects/log-entry.ts'

/** Both record kinds returned by a read, split by kind. */
export interface ParsedLogs {
  requests: AccessLogEntry[]
  logs: AppLogEntry[]
}

/**
 * Port for the log source. Implemented in the Adapters layer (the filesystem log
 * volumes). A read returns the current full view; the ingest service polls it.
 */
export interface LogStore {
  readAll(): Promise<ParsedLogs>
}
