import type { LogStore } from '../../../Ports/LogStore/log-store.ts';
import type { AccessLogEntry, AppLogEntry } from '../../../Domain/ValueObjects/log-entry.ts';

/**
 * Background service holding the in-memory view of the logs, rebuilt from the
 * LogStore on an interval. The query service reads the current view; new requests
 * show up within one refresh cycle.
 */
export class LogIngestService {
  private store: LogStore;
  private intervalMs: number;
  private entries: AccessLogEntry[] = [];
  private logs: AppLogEntry[] = [];
  private lastRefresh: string | null = null;

  constructor(store: LogStore, intervalMs: number) {
    this.store = store;
    this.intervalMs = intervalMs;
  }

  async refresh(): Promise<void> {
    try {
      const parsed = await this.store.readAll();
      this.entries = parsed.requests;
      this.logs = parsed.logs;
      this.lastRefresh = new Date().toISOString();
    } catch (err) {
      console.error(`[ingest] refresh failed: ${(err as Error).message}`);
    }
  }

  /** Load once, then re-ingest on the configured interval. */
  async start(): Promise<void> {
    await this.refresh();
    console.log(`[ingest] loaded ${this.entries.length} requests, ${this.logs.length} app-log entries`);
    setInterval(() => void this.refresh(), this.intervalMs);
  }

  getEntries(): AccessLogEntry[] {
    return this.entries;
  }

  getLogs(): AppLogEntry[] {
    return this.logs;
  }

  getLastRefresh(): string | null {
    return this.lastRefresh;
  }
}
