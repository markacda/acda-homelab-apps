import type { LogStore } from '../../../Ports/LogStore/log-store.ts';
import type { AccessLogEntry, AppLogEntry, ExceptionLogEntry, DependencyLogEntry } from '../../../Domain/ValueObjects/log-entry.ts';
import type { Notifier } from '../../../Ports/Notifier/notifier.ts';
import { evaluateAlertRules, type AlertRuleConfig } from '../../../Domain/Services/alert-rules.ts';

/**
 * Background service holding the in-memory view of the logs, rebuilt from the
 * LogStore on an interval. The query service reads the current view; new records
 * show up within one refresh cycle. When a Notifier is provided, each cycle (after
 * the first) also evaluates the alert rules over a trailing window and pushes a
 * notification per firing rule — subject to a per-rule cooldown, and only over
 * records that appeared since the service started (so a restart doesn't replay the
 * backlog as fresh alerts).
 */
export class LogIngestService {
  private store: LogStore;
  private intervalMs: number;
  private notifier?: Notifier;
  private alertConfig?: AlertRuleConfig;
  private cooldownMs: number;
  private entries: AccessLogEntry[] = [];
  private logs: AppLogEntry[] = [];
  private exceptions: ExceptionLogEntry[] = [];
  private dependencies: DependencyLogEntry[] = [];
  private lastRefresh: string | null = null;
  // Records at or before this ISO timestamp existed at boot; alerts ignore them.
  private startedAt = '';
  // Per-rule (by alert key) epoch-ms of the last time we fired it, for cooldown.
  private lastAlertAt = new Map<string, number>();

  constructor(store: LogStore, intervalMs: number, notifier?: Notifier, alertConfig?: AlertRuleConfig, cooldownMs = 15 * 60 * 1000) {
    this.store = store;
    this.intervalMs = intervalMs;
    this.notifier = notifier;
    this.alertConfig = alertConfig;
    this.cooldownMs = cooldownMs;
  }

  async refresh(): Promise<void> {
    try {
      const parsed = await this.store.readAll();
      this.entries = parsed.requests;
      this.logs = parsed.logs;
      this.exceptions = parsed.exceptions;
      this.dependencies = parsed.dependencies;
      this.lastRefresh = new Date().toISOString();
    } catch (err) {
      console.error(`[ingest] refresh failed: ${(err as Error).message}`);
    }
  }

  /** Load once, then re-ingest on the configured interval. */
  async start(): Promise<void> {
    await this.refresh();
    // Anchor "now" so pre-existing records aren't treated as new alerts on (re)start.
    this.startedAt = new Date().toISOString();
    console.log(
      `[ingest] loaded ${this.entries.length} requests, ${this.logs.length} app-log entries, ${this.exceptions.length} exceptions, ${this.dependencies.length} dependencies`
    );
    setInterval(() => void this.cycle(), this.intervalMs);
  }

  /** One poll cycle: refresh the view, then evaluate the alert rules. */
  private async cycle(): Promise<void> {
    await this.refresh();
    await this.evaluateAlerts();
  }

  /** Run the rule engine over records seen since boot and notify (with cooldown). */
  private async evaluateAlerts(): Promise<void> {
    if (!this.notifier || !this.alertConfig) return;
    const now = Date.now();
    const boot = this.startedAt;
    const alerts = evaluateAlertRules(
      {
        requests: this.entries.filter((e) => e.ts > boot),
        exceptions: this.exceptions.filter((e) => e.ts > boot),
      },
      this.alertConfig,
      now
    );
    for (const alert of alerts) {
      const last = this.lastAlertAt.get(alert.key) ?? 0;
      if (now - last < this.cooldownMs) continue; // still cooling down; skip
      this.lastAlertAt.set(alert.key, now);
      try {
        await this.notifier.notify({ title: alert.title, message: alert.message, url: '/logs/' });
      } catch (err) {
        console.error(`[ingest] alert notification failed: ${(err as Error).message}`);
      }
    }
  }

  getEntries(): AccessLogEntry[] {
    return this.entries;
  }

  getLogs(): AppLogEntry[] {
    return this.logs;
  }

  getExceptions(): ExceptionLogEntry[] {
    return this.exceptions;
  }

  getDependencies(): DependencyLogEntry[] {
    return this.dependencies;
  }

  getLastRefresh(): string | null {
    return this.lastRefresh;
  }
}
