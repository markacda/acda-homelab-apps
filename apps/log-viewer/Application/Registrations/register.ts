import type { Express } from "express";
import { FileLogStore } from "../../Adapters/FileLogStore/file-log-store.ts";
import { LogIngestService } from "../Services/Background/log-ingest-service.ts";
import { LogQueryService } from "../Services/log-query-service.ts";
import { RequestLogController } from "../Controllers/request-log-controller.ts";
import { AppLogController } from "../Controllers/app-log-controller.ts";

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
  const logsRoot = process.env.LOGS_ROOT || "/logs";
  console.log(`log-viewer LOGS_ROOT=${logsRoot}`);

  const store = new FileLogStore(logsRoot);
  const ingest = new LogIngestService(store, REFRESH_INTERVAL_MS);
  const query = new LogQueryService(ingest);

  const requestController = new RequestLogController(query);
  const appLogController = new AppLogController(query);

  app.use("/api", requestController.router); // /api/logs, /api/stats, /api/meta
  app.use("/api/app-logs", appLogController.router); // /api/app-logs[/stats|/meta]

  return ingest;
}
