import type { LogStore } from '../../../Ports/LogStore/log-store.ts';
import type { AccessLogEntry, AppLogEntry } from '../../../Domain/ValueObjects/log-entry.ts';
import type { FailureNotifier } from '../../../Ports/Notifier/failure-notifier.ts';

/** Alert only on server errors (5xx); 3xx/4xx are not pushed as notifications. */
const FAILURE_STATUS = 500;

/**
 * Background service holding the in-memory view of the logs, rebuilt from the
 * LogStore on an interval. The query service reads the current view; new requests
 * show up within one refresh cycle. When a FailureNotifier is provided, each
 * cycle (after the first) also pushes a notification for newly-seen failed
 * requests, tracked by a high-water timestamp so the boot backlog isn't replayed.
 */
export class LogIngestService {
  private store: LogStore;
  private intervalMs: number;
  private notifier?: FailureNotifier;
  private entries: AccessLogEntry[] = [];
  private logs: AppLogEntry[] = [];
  private lastRefresh: string | null = null;
  private highWater = '';

  constructor(store: LogStore, intervalMs: number, notifier?: FailureNotifier) {
    this.store = store;
    this.intervalMs = intervalMs;
    this.notifier = notifier;
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
    // Anchor the high-water mark at the latest entry already on disk so existing
    // failures aren't re-notified when the service (re)starts.
    this.highWater = this.latestTs();
    console.log(`[ingest] loaded ${this.entries.length} requests, ${this.logs.length} app-log entries`);
    setInterval(() => void this.cycle(), this.intervalMs);
  }

  /** One poll cycle: refresh the view, then notify on any new failures. */
  private async cycle(): Promise<void> {
    await this.refresh();
    await this.notifyNewFailures();
  }

  private async notifyNewFailures(): Promise<void> {
    if (!this.notifier) return;
    // entries are ts-descending, so the first match is the most recent failure.
    const newFailures = this.entries.filter((e) => e.ts > this.highWater && e.status >= FAILURE_STATUS);
    const latestTs = this.latestTs();
    if (latestTs > this.highWater) this.highWater = latestTs;
    if (newFailures.length === 0) return;
    const latest = newFailures[0];
    try {
      await this.notifier.notify({
        count: newFailures.length,
        latest: { method: latest.method ?? '?', url: latest.url ?? '?', status: latest.status, app: latest.app },
      });
    } catch (err) {
      console.error(`[ingest] failure notification failed: ${(err as Error).message}`);
    }
  }

  /** The newest entry timestamp currently in view (entries are ts-descending). */
  private latestTs(): string {
    return this.entries.reduce((max, e) => (e.ts > max ? e.ts : max), this.highWater);
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
