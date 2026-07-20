import type { Express } from 'express';
import { FileLogStore } from '../../Adapters/FileLogStore/file-log-store.ts';
import { HttpFailureNotifier } from '../../Adapters/Notifier/http-failure-notifier.ts';
import type { FailureNotifier } from '../../Ports/Notifier/failure-notifier.ts';
import { LogIngestService } from '../Services/Background/log-ingest-service.ts';
import { LogQueryService } from '../Services/log-query-service.ts';
import { RequestLogController } from '../Controllers/request-log-controller.ts';
import { AppLogController } from '../Controllers/app-log-controller.ts';

// Re-ingest on an interval; new requests show up within one cycle.
const REFRESH_INTERVAL_MS = 15_000;

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

  // Optional: post an alert to the notification app when new failed requests
  // appear. Enabled only when NOTIFICATION_URL is set (feature off otherwise).
  const notificationUrl = process.env.NOTIFICATION_URL;
  let notifier: FailureNotifier | undefined;
  if (notificationUrl) {
    notifier = new HttpFailureNotifier(notificationUrl, process.env.SEND_TOKEN || undefined);
    console.log(`log-viewer failure notifications -> ${notificationUrl}`);
  }

  const store = new FileLogStore(logsRoot);
  const ingest = new LogIngestService(store, REFRESH_INTERVAL_MS, notifier);
  const query = new LogQueryService(ingest);

  const requestController = new RequestLogController(query);
  const appLogController = new AppLogController(query);

  app.use('/api', requestController.router); // /api/logs, /api/stats, /api/meta
  app.use('/api/app-logs', appLogController.router); // /api/app-logs[/stats|/meta]

  return ingest;
}
