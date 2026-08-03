import type { Express } from 'express';
import { FileLogStore } from '../../Adapters/FileLogStore/file-log-store.ts';
import { HttpNotifier } from '../../Adapters/Notifier/http-notifier.ts';
import type { Notifier } from '../../Ports/Notifier/notifier.ts';
import { LogIngestService } from '../Services/Background/log-ingest-service.ts';
import type { AlertRuleConfig } from '../../Domain/Services/alert-rules.ts';
import { LogQueryService } from '../Services/log-query-service.ts';
import { RequestLogController } from '../Controllers/request-log-controller.ts';
import { AppLogController } from '../Controllers/app-log-controller.ts';
import { ExceptionController } from '../Controllers/exception-controller.ts';
import { DependencyController } from '../Controllers/dependency-controller.ts';
import { TraceController } from '../Controllers/trace-controller.ts';

// Re-ingest on an interval; new requests show up within one cycle.
const REFRESH_INTERVAL_MS = 15_000;

/** Read a numeric env var, falling back to `fallback` when unset/non-finite. */
function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Composition root: build the log-store adapter, the background ingest service,
 * the query service and the two controllers, and mount the routes. Returns the
 * ingest service so server.ts can start it once listening.
 */
export function register(app: Express): LogIngestService {
  // Root under which each app's log dir/volume is mounted. In dev, point this at
  // the repo's apps/ folder (recursive scan finds each apps/<name>/logs/).
  const logsRoot = process.env.LOGS_ROOT || '/logs';
  console.log(`log-viewer LOGS_ROOT=${logsRoot}`);

  // Optional: post alerts to the notification app when a rule fires over a
  // trailing window. Enabled only when NOTIFICATION_URL is set (off otherwise).
  const notificationUrl = process.env.NOTIFICATION_URL;
  let notifier: Notifier | undefined;
  if (notificationUrl) {
    notifier = new HttpNotifier(notificationUrl, process.env.SEND_TOKEN || undefined);
    console.log(`log-viewer alert notifications -> ${notificationUrl}`);
  }

  const alertConfig: AlertRuleConfig = {
    windowMs: numEnv('ALERT_WINDOW_MS', 5 * 60 * 1000),
    errorBurst: numEnv('ALERT_ERROR_BURST', 5),
    errorRate: numEnv('ALERT_ERROR_RATE', 0.5),
    slowP95Ms: numEnv('ALERT_SLOW_P95_MS', 3000),
    exceptionBurst: numEnv('ALERT_EXCEPTION_BURST', 5),
    minSample: numEnv('ALERT_MIN_SAMPLE', 20),
  };
  const cooldownMs = numEnv('ALERT_COOLDOWN_MS', 15 * 60 * 1000);

  const store = new FileLogStore(logsRoot);
  const ingest = new LogIngestService(store, REFRESH_INTERVAL_MS, notifier, alertConfig, cooldownMs);
  const query = new LogQueryService(ingest);

  const requestController = new RequestLogController(query);
  const appLogController = new AppLogController(query);
  const exceptionController = new ExceptionController(query);
  const dependencyController = new DependencyController(query);
  const traceController = new TraceController(query);

  app.use('/api/app-logs', appLogController.router); // /api/app-logs[/stats|/meta]
  app.use('/api/exceptions', exceptionController.router); // /api/exceptions[/stats|/meta]
  app.use('/api/dependencies', dependencyController.router); // /api/dependencies[/stats|/meta]
  app.use('/api/trace', traceController.router); // /api/trace/:traceId (cross-kind timeline)
  app.use('/api', requestController.router); // /api/logs, /api/stats, /api/meta

  return ingest;
}
