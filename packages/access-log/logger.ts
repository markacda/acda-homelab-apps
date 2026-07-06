import { createStream } from "rotating-file-stream";
import { join } from "node:path";
import { format } from "node:util";
import type { IncomingHttpHeaders } from "node:http";
import type { RequestHandler } from "express";

// Structured per-request access log. One JSON object per line, written to a
// daily-rotated file. Old files are gzipped and only ~90 are kept, giving a
// ~3-month retention window. LOG_DIR is a persistent volume in Docker.
const LOG_DIR = process.env.LOG_DIR || join(process.cwd(), "logs");

// Shared rotation options for both the access log and the app (console) log.
const ROTATE_OPTS = {
  interval: "1d", // rotate daily
  path: LOG_DIR,
  maxFiles: 90, // keep ~90 days -> 3-month retention
  compress: "gzip", // gzip rotated files to save disk on the Pi
} as const;

// Lazily open the rotating stream on first write, so importing this module
// (e.g. to unit-test buildEntry) has no filesystem side effects.
let stream: ReturnType<typeof createStream> | undefined;
function logStream(): ReturnType<typeof createStream> {
  if (!stream) {
    stream = createStream("access.log", ROTATE_OPTS);
  }
  return stream;
}

// Second rotating stream for application (console) logs, kept in the same
// LOG_DIR so it rides the Log Viewer's existing read-only volume mounts.
let appStream: ReturnType<typeof createStream> | undefined;
function appLogStream(): ReturnType<typeof createStream> {
  if (!appStream) {
    appStream = createStream("app.log", ROTATE_OPTS);
  }
  return appStream;
}

// Health-check polls hit every 30s; keep them out of the page-load log.
const SKIP_PATHS = new Set(["/healthz", "/health"]);

// buildEntry only reads these fields, so it accepts anything structurally
// compatible: a real Express req/res and the lightweight test doubles alike.
interface LoggableRequest {
  method?: string;
  originalUrl?: string;
  url?: string;
  ip?: string;
  socket?: { remoteAddress?: string };
  headers?: IncomingHttpHeaders;
}

interface LoggableResponse {
  statusCode: number;
  getHeader?: (name: string) => number | string | string[] | undefined;
}

export interface AccessLogEntry {
  ts: string;
  app: string;
  method: string | undefined;
  url: string | undefined;
  status: number;
  durationMs: number;
  ip: string | null;
  ua: string | null;
  referer: string | null;
  bytes: number | null;
}

/**
 * Build a structured access-log entry from a finished request/response.
 * Pure and side-effect free so it can be unit-tested without a real socket.
 */
export function buildEntry(
  req: LoggableRequest,
  res: LoggableResponse,
  durationMs: number,
  app: string,
  nowIso: string = new Date().toISOString(),
): AccessLogEntry {
  return {
    ts: nowIso,
    app,
    method: req.method,
    url: req.originalUrl || req.url,
    status: res.statusCode,
    durationMs,
    ip: req.ip || req.socket?.remoteAddress || null,
    ua: req.headers?.["user-agent"] || null,
    referer: req.headers?.referer || null,
    bytes: Number(res.getHeader?.("content-length")) || null,
  };
}

/** Express middleware that writes one JSON line per request to the rotating log. */
export function pageLoadLogger(app: string): RequestHandler {
  return (req, res, next) => {
    if (SKIP_PATHS.has(req.path)) return next();
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const durationMs = Math.round(Number(process.hrtime.bigint() - start) / 1e3) / 1e3;
      logStream().write(JSON.stringify(buildEntry(req, res, durationMs, app)) + "\n");
    });
    next();
  };
}

// ---- application (console) logging ----------------------------------------

// The console methods we mirror into app.log. `erasableSyntaxOnly` forbids
// enums, so this is a plain const tuple.
export const LOG_LEVELS = ["log", "info", "warn", "error", "debug"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

// A structured application-log record: one JSON object per line in app.log.
// Distinct from AccessLogEntry (which has `status`) by its `level`/`message`.
export interface AppLogEntry {
  ts: string;
  app: string;
  level: LogLevel;
  message: string; // human-readable, util.format(...args)
  params: unknown[]; // JSON-safe per-argument values, for structured display
}

/** Make a single console argument JSON-safe for the `params` array. */
function safeParam(arg: unknown): unknown {
  if (arg instanceof Error) {
    return { name: arg.name, message: arg.message, stack: arg.stack };
  }
  if (arg === null || typeof arg !== "object") return arg; // primitives pass through
  try {
    // Round-trip through JSON so only serializable data survives (drops
    // functions, handles nested structures, and surfaces any toJSON()).
    return JSON.parse(JSON.stringify(arg));
  } catch {
    return String(arg); // circular refs / non-serializable -> best-effort string
  }
}

/**
 * Build a structured application-log entry from console arguments.
 * Pure and side-effect free so it can be unit-tested (inject `nowIso`).
 */
export function buildAppLogEntry(
  level: LogLevel,
  args: unknown[],
  app: string,
  nowIso: string = new Date().toISOString(),
): AppLogEntry {
  return {
    ts: nowIso,
    app,
    level,
    message: format(...args),
    params: args.map(safeParam),
  };
}

let consoleInstalled = false;

/**
 * Wrap console.{log,info,warn,error,debug} so each call ALSO writes a structured
 * AppLogEntry line to app.log, in addition to its normal stdout/stderr output.
 * Idempotent; call once at app startup before other code logs.
 */
export function installConsoleLogging(app: string): void {
  if (consoleInstalled) return;
  consoleInstalled = true;
  for (const level of LOG_LEVELS) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]): void => {
      original(...args); // keep the normal stdout/stderr output intact
      try {
        appLogStream().write(JSON.stringify(buildAppLogEntry(level, args, app)) + "\n");
      } catch {
        // Logging must never crash the app; drop the line on any write error.
      }
    };
  }
}
