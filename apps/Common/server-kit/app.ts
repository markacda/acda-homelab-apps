import express from 'express';
import type { Express, RequestHandler, ErrorRequestHandler } from 'express';
import type { Server } from 'node:http';
import { join } from 'node:path';
import {
  pageLoadLogger,
  installConsoleLogging,
  installFetchLogging,
  installProcessExceptionHandlers,
  logException,
  closeLogStreams,
} from '../access-log/logger.ts';

// Shared Express bootstrap. Folds together the ritual every app's server.ts used
// to repeat: install console logging, create the app, mount the access logger
// first, expose /healthz, serve public/, and listen on 0.0.0.0 — plus the two
// behaviours no app had before: a terminal error handler and graceful shutdown.

/**
 * Create an Express app with console mirroring installed and the structured
 * access logger mounted as the FIRST middleware. Callers register their own
 * routes on the returned app, then hand it to startServer().
 */
export function createApp(name: string): Express {
  // Mirror console.* output into the structured app.log (see log-viewer), time
  // outbound fetches as dependencies, and record process-level faults as
  // first-class exceptions. All idempotent.
  installConsoleLogging(name);
  installFetchLogging(name);
  installProcessExceptionHandlers(name);
  const app = express();
  app.use(pageLoadLogger(name));
  return app;
}

/**
 * Standard health handler: 200 `{ status: "ok" }`. When a `healthCheck` is
 * given, it is awaited first (e.g. a DB ping); if it throws, respond
 * 503 `{ status: "unhealthy" }` so the container healthcheck reports the app as
 * unhealthy while its dependency is down. Excluded from the access log.
 */
export function healthHandler(healthCheck?: () => Promise<void> | void): RequestHandler {
  return (_req, res) => {
    // Fast path: no probe, respond synchronously.
    if (!healthCheck) {
      res.json({ status: 'ok' });
      return;
    }
    void Promise.resolve()
      .then(() => healthCheck())
      .then(() => res.json({ status: 'ok' }))
      .catch((err) => {
        console.error('healthcheck failed', err);
        res.status(503).json({ status: 'unhealthy' });
      });
  };
}

/**
 * Error-logging middleware. Catches every unhandled exception, logs it at
 * `error` level (so it lands in app.log), and re-forwards it via next(err) so a
 * downstream handler can still respond. Passing the raw Error object to
 * console.error is deliberate: access-log's safeParam serializes it to
 * { name, message, stack }, capturing the stack trace in the app-log params.
 * Mount BEFORE errorHandler. Express 5 forwards both sync and async route
 * errors here automatically.
 */
export function errorLogger(name: string): ErrorRequestHandler {
  return (err, req, _res, next) => {
    console.error(`[${name}] unhandled error`, err);
    // Also record a first-class exception, correlated to the in-flight request
    // (traceId resolves automatically from the request's async context).
    logException(err, name, 'express', { method: req.method, url: req.originalUrl || req.url });
    next(err);
  };
}

/**
 * Terminal Express error handler. Responds `500 { error }` unless the response
 * has already started. Mount LAST, after all routes and static middleware
 * (errorLogger handles the logging).
 */
export function errorHandler(_name: string): ErrorRequestHandler {
  return (_err, _req, res, _next) => {
    if (res.headersSent) return;
    res.status(500).json({ error: 'Internal server error' });
  };
}

export interface StartOptions {
  name: string;
  port: number;
  // Directory served by express.static. Defaults to <cwd>/public; pass null to
  // disable (e.g. atc mounts its own static with caching options), or a path to
  // override. cwd resolves correctly in dev and Docker (WORKDIR /app).
  staticDir?: string | null;
  // Called once the server is listening; receives the http.Server (e.g. to start
  // a background poll loop).
  onListen?: (server: Server) => void;
  // Called during graceful shutdown, before the HTTP server closes and log
  // streams flush (e.g. to disconnect a long-lived MQTT/DB client). Awaited; the
  // shutdown timeout still guards against it hanging.
  onShutdown?: () => Promise<void> | void;
  // Optional readiness probe run on every GET /healthz (e.g. a DB ping). If it
  // throws, /healthz responds 503; if omitted, /healthz is always 200.
  healthCheck?: () => Promise<void> | void;
}

// How long to wait for in-flight connections to drain before forcing exit.
const SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * Mount the standard /healthz, static serving, and terminal error handler on the
 * app, start listening on 0.0.0.0:<port>, and wire up SIGTERM/SIGINT graceful
 * shutdown. Returns the http.Server.
 */
export function startServer(app: Express, opts: StartOptions): Server {
  const { name, port, staticDir, onListen, onShutdown, healthCheck } = opts;

  app.get('/healthz', healthHandler(healthCheck));

  const dir = staticDir === undefined ? join(process.cwd(), 'public') : staticDir;
  if (dir) app.use(express.static(dir));

  app.use(errorLogger(name));
  app.use(errorHandler(name));

  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`${name} listening on http://0.0.0.0:${port}`);
    onListen?.(server);
  });

  installGracefulShutdown(server, name, onShutdown);
  return server;
}

/** Close the server on SIGTERM/SIGINT, forcing exit if it doesn't drain in time. */
function installGracefulShutdown(server: Server, name: string, onShutdown?: () => Promise<void> | void): void {
  let shuttingDown = false;
  const signals = ['SIGTERM', 'SIGINT'] as const;
  for (const signal of signals) {
    process.on(signal, () => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`${name} received ${signal}, shutting down`);
      const timer = setTimeout(() => {
        console.error(`${name} shutdown timed out after ${SHUTDOWN_TIMEOUT_MS}ms, forcing exit`);
        process.exit(1);
      }, SHUTDOWN_TIMEOUT_MS);
      timer.unref(); // don't keep the process alive just for the timer
      // Run the app's own cleanup (e.g. disconnect an MQTT/DB client) first, then
      // close the HTTP server; the timeout above guards both. A cleanup failure
      // is logged but never blocks the rest of shutdown.
      void Promise.resolve()
        .then(() => onShutdown?.())
        .catch((err) => console.error(`${name} error during onShutdown: ${(err as Error).message}`))
        .finally(() => {
          server.close((err) => {
            if (err) console.error(`${name} error during shutdown: ${err.message}`);
            // Flush buffered log writes before exiting so the tail isn't lost. The
            // timeout above still stands guard in case the flush itself hangs.
            void closeLogStreams().finally(() => {
              clearTimeout(timer);
              process.exit(err ? 1 : 0);
            });
          });
        });
    });
  }
}
