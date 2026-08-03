import { createStream } from 'rotating-file-stream';
import { join } from 'node:path';
import { format } from 'node:util';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'node:http';
import type { RequestHandler } from 'express';

export { DISCOVERY_UA } from './constants.ts';

// ---- request correlation --------------------------------------------------

// A per-request trace id, propagated through async work via AsyncLocalStorage so
// the app-logs, dependencies and exceptions produced while handling a request can
// be tied back to it. Work outside a request (startup, background polls) has none.
interface TraceContext {
  traceId: string;
}
const traceStore = new AsyncLocalStorage<TraceContext>();

/** The trace id of the in-flight request, or undefined outside one. */
export function currentTraceId(): string | undefined {
  return traceStore.getStore()?.traceId;
}

// Structured per-request access log. One JSON object per line, written to a
// daily-rotated file. Old files are gzipped and only ~30 are kept, giving a
// ~1-month retention window. LOG_DIR is a persistent volume in Docker.
const LOG_DIR = process.env.LOG_DIR || join(process.cwd(), 'logs');

// Shared rotation options for both the access log and the app (console) log.
const ROTATE_OPTS = {
  interval: '1d', // rotate daily
  path: LOG_DIR,
  maxFiles: 30, // keep ~30 days -> 1-month retention
  compress: 'gzip', // gzip rotated files to save disk on the Pi
} as const;

// Lazily open the rotating stream on first write, so importing this module
// (e.g. to unit-test buildEntry) has no filesystem side effects.
let stream: ReturnType<typeof createStream> | undefined;
function logStream(): ReturnType<typeof createStream> {
  if (!stream) {
    stream = createStream('access.log', ROTATE_OPTS);
  }
  return stream;
}

// Second rotating stream for application (console) logs, kept in the same
// LOG_DIR so it rides the Log Viewer's existing read-only volume mounts.
let appStream: ReturnType<typeof createStream> | undefined;
function appLogStream(): ReturnType<typeof createStream> {
  if (!appStream) {
    appStream = createStream('app.log', ROTATE_OPTS);
  }
  return appStream;
}

// Two further streams, kept in the same LOG_DIR so they ride the Log Viewer's
// existing read-only volume mounts: first-class exception and outbound-dependency
// records (Application-Insights style), separate from the request + console logs.
let excStream: ReturnType<typeof createStream> | undefined;
function excLogStream(): ReturnType<typeof createStream> {
  if (!excStream) {
    excStream = createStream('exceptions.log', ROTATE_OPTS);
  }
  return excStream;
}

let depStream: ReturnType<typeof createStream> | undefined;
function depLogStream(): ReturnType<typeof createStream> {
  if (!depStream) {
    depStream = createStream('dependencies.log', ROTATE_OPTS);
  }
  return depStream;
}

/**
 * Flush and close every rotating log stream, resolving once the OS has the
 * buffered data. Call on graceful shutdown so the tail of the log isn't lost
 * when the process exits. A no-op (resolves immediately) for streams never opened.
 */
export function closeLogStreams(): Promise<void> {
  const open = [stream, appStream, excStream, depStream].filter((s): s is NonNullable<typeof s> => Boolean(s));
  return Promise.all(open.map((s) => new Promise<void>((resolve) => s.end(resolve)))).then(() => undefined);
}

// Health-check polls hit every 30s; keep them out of the page-load log.
const SKIP_PATHS = new Set(['/healthz', '/health']);

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
  getHeaders?: () => OutgoingHttpHeaders;
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
  // Correlation id shared with the app-logs/dependencies/exceptions this request
  // produced. Omitted for entries written before correlation was introduced.
  traceId?: string;
  // Present only for non-2xx responses: the full response header map (with
  // sensitive values redacted) and a size-bounded copy of the response body.
  // Omitted entirely on 2xx to keep the common case's log lines small.
  resHeaders?: Record<string, string | number | string[]>;
  resBody?: string;
  resBodyTruncated?: boolean;
}

// A response is "interesting" (worth capturing headers + body for) when it is
// anything other than a 2xx success.
function isNon2xx(status: number): boolean {
  return status < 200 || status >= 300;
}

// Cap the captured response body so a large error page can't bloat a log line.
export const BODY_CAP = 32 * 1024;

// Content-types whose bodies are worth capturing as text. Anything else is
// stored as a short placeholder rather than mojibake.
const TEXT_CT = /\b(json|text|xml|html|x-www-form-urlencoded)\b/i;

// Response header values that must never be persisted verbatim in long-lived logs.
const REDACT_HEADERS = new Set(['set-cookie', 'authorization']);

/** Copy the response header map, redacting the values of sensitive headers. */
function redactHeaders(headers: OutgoingHttpHeaders): Record<string, string | number | string[]> {
  const out: Record<string, string | number | string[]> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    out[key] = REDACT_HEADERS.has(key.toLowerCase()) ? '[redacted]' : value;
  }
  return out;
}

/**
 * Build a structured access-log entry from a finished request/response.
 * Pure and side-effect free so it can be unit-tested without a real socket.
 * `resBody`/`resBodyTruncated` are captured by the middleware and injected here;
 * they, and the response header map, are only recorded for non-2xx responses.
 */
export function buildEntry(
  req: LoggableRequest,
  res: LoggableResponse,
  durationMs: number,
  app: string,
  nowIso: string = new Date().toISOString(),
  resBody?: string,
  resBodyTruncated?: boolean,
  traceId?: string
): AccessLogEntry {
  const entry: AccessLogEntry = {
    ts: nowIso,
    app,
    method: req.method,
    url: req.originalUrl || req.url,
    status: res.statusCode,
    durationMs,
    ip: req.ip || req.socket?.remoteAddress || null,
    ua: req.headers?.['user-agent'] || null,
    referer: req.headers?.referer || null,
    bytes: Number(res.getHeader?.('content-length')) || null,
  };
  if (traceId !== undefined) entry.traceId = traceId;
  if (isNon2xx(res.statusCode)) {
    const headers = res.getHeaders?.();
    if (headers) entry.resHeaders = redactHeaders(headers);
    if (resBody !== undefined) entry.resBody = resBody;
    if (resBodyTruncated) entry.resBodyTruncated = true;
  }
  return entry;
}

/** Express middleware that writes one JSON line per request to the rotating log. */
export function pageLoadLogger(app: string): RequestHandler {
  return (req, res, next) => {
    if (SKIP_PATHS.has(req.path)) return next();
    // A fresh correlation id per request. Captured here (not read at "finish",
    // which fires outside the AsyncLocalStorage scope) so it lands on the entry.
    const traceId = randomUUID();
    const start = process.hrtime.bigint();

    // Buffer the response body as it's written so it's still available at
    // "finish" (which fires after the body has been flushed). Only non-2xx
    // bodies are kept, capped at BODY_CAP bytes.
    const chunks: Buffer[] = [];
    let size = 0;
    let truncated = false;
    const capture = (chunk: unknown): void => {
      if (!isNon2xx(res.statusCode) || size >= BODY_CAP) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : typeof chunk === 'string' ? Buffer.from(chunk) : undefined;
      if (!buf) return;
      const room = BODY_CAP - size;
      if (buf.length > room) {
        chunks.push(buf.subarray(0, room));
        size = BODY_CAP;
        truncated = true;
      } else {
        chunks.push(buf);
        size += buf.length;
      }
    };

    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);
    res.write = ((chunk: unknown, ...rest: unknown[]) => {
      capture(chunk);
      return (origWrite as (...args: unknown[]) => unknown)(chunk, ...rest);
    }) as typeof res.write;
    res.end = ((chunk?: unknown, ...rest: unknown[]) => {
      // res.end(cb) passes the callback as the first arg — don't treat it as a body chunk.
      if (typeof chunk !== 'function') capture(chunk);
      return (origEnd as (...args: unknown[]) => unknown)(chunk, ...rest);
    }) as typeof res.end;

    res.on('finish', () => {
      const durationMs = Math.round(Number(process.hrtime.bigint() - start) / 1e3) / 1e3;
      let body: string | undefined;
      let bodyTruncated = false;
      if (isNon2xx(res.statusCode) && size > 0) {
        const ct = String(res.getHeader?.('content-type') ?? '');
        if (TEXT_CT.test(ct)) {
          body = Buffer.concat(chunks).toString('utf8');
          bodyTruncated = truncated; // truncation only meaningful for the captured text
        } else {
          body = `[binary, ${size} bytes, ${ct || 'unknown content-type'}]`;
        }
      }
      logStream().write(JSON.stringify(buildEntry(req, res, durationMs, app, undefined, body, bodyTruncated, traceId)) + '\n');
    });
    // Run the rest of the request inside the trace scope so console.* /
    // dependency / exception records made while handling it inherit the id.
    traceStore.run({ traceId }, () => next());
  };
}

// ---- application (console) logging ----------------------------------------

// The console methods we mirror into app.log. `erasableSyntaxOnly` forbids
// enums, so this is a plain const tuple.
export const LOG_LEVELS = ['log', 'info', 'warn', 'error', 'debug'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

// A structured application-log record: one JSON object per line in app.log.
// Distinct from AccessLogEntry (which has `status`) by its `level`/`message`.
export interface AppLogEntry {
  ts: string;
  app: string;
  level: LogLevel;
  message: string; // human-readable, util.format(...args)
  params: unknown[]; // JSON-safe per-argument values, for structured display
  traceId?: string; // correlation id when logged while handling a request
}

/** Make a single console argument JSON-safe for the `params` array. */
function safeParam(arg: unknown): unknown {
  if (arg instanceof Error) {
    return { name: arg.name, message: arg.message, stack: arg.stack };
  }
  if (arg === null || typeof arg !== 'object') return arg; // primitives pass through
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
  traceId?: string
): AppLogEntry {
  const entry: AppLogEntry = {
    ts: nowIso,
    app,
    level,
    message: format(...args),
    params: args.map(safeParam),
  };
  if (traceId !== undefined) entry.traceId = traceId;
  return entry;
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
        appLogStream().write(JSON.stringify(buildAppLogEntry(level, args, app, undefined, currentTraceId())) + '\n');
      } catch {
        // Logging must never crash the app; drop the line on any write error.
      }
    };
  }
}

// ---- exception records ------------------------------------------------------

// Where an exception was caught. `express` = an unhandled route error; `uncaught`
// / `unhandledRejection` = a process-level fault; `manual` = an explicit
// logException() call from app code.
export const EXCEPTION_SOURCES = ['express', 'uncaught', 'unhandledRejection', 'manual'] as const;
export type ExceptionSource = (typeof EXCEPTION_SOURCES)[number];

// A first-class exception record: one JSON object per line in exceptions.log. The
// `kind` discriminator lets the log-viewer classify it unambiguously (the request
// and app-log records have no `kind`).
export interface ExceptionLogEntry {
  ts: string;
  app: string;
  kind: 'exception';
  name: string; // error class name (e.g. "TypeError")
  message: string;
  stack?: string;
  source: ExceptionSource;
  traceId?: string; // the request this happened under, when applicable
  method?: string; // request context, when caught in a route
  url?: string;
  status?: number;
}

/** Optional request context attached to an exception caught while serving one. */
export interface ExceptionContext {
  traceId?: string;
  method?: string;
  url?: string;
  status?: number;
}

/**
 * Build a structured exception record. Pure and side-effect free (inject
 * `nowIso`). Accepts an unknown throwable: an Error keeps its name/message/stack,
 * anything else is best-effort stringified.
 */
export function buildException(
  err: unknown,
  app: string,
  source: ExceptionSource,
  ctx: ExceptionContext = {},
  nowIso: string = new Date().toISOString()
): ExceptionLogEntry {
  const isError = err instanceof Error;
  const entry: ExceptionLogEntry = {
    ts: nowIso,
    app,
    kind: 'exception',
    name: isError ? err.name : 'Error',
    message: isError ? err.message : String(err),
    source,
  };
  if (isError && err.stack) entry.stack = err.stack;
  const traceId = ctx.traceId ?? currentTraceId();
  if (traceId !== undefined) entry.traceId = traceId;
  if (ctx.method !== undefined) entry.method = ctx.method;
  if (ctx.url !== undefined) entry.url = ctx.url;
  if (ctx.status !== undefined) entry.status = ctx.status;
  return entry;
}

/** Write an exception record to exceptions.log. Never throws. */
export function logException(err: unknown, app: string, source: ExceptionSource, ctx: ExceptionContext = {}): void {
  try {
    excLogStream().write(JSON.stringify(buildException(err, app, source, ctx)) + '\n');
  } catch {
    // Logging must never crash the app.
  }
}

// ---- dependency records -----------------------------------------------------

// The kinds of outbound call we time. `http` = a global fetch; `postgres` = a
// query through the shared pool.
export const DEPENDENCY_TYPES = ['http', 'postgres'] as const;
export type DependencyType = (typeof DEPENDENCY_TYPES)[number];

// A first-class outbound-dependency record: one JSON object per line in
// dependencies.log. `kind` discriminates it from the other record shapes.
export interface DependencyLogEntry {
  ts: string;
  app: string;
  kind: 'dependency';
  type: DependencyType;
  target: string; // host (http) or logical target such as "db" (postgres)
  name: string; // e.g. "GET /send" or "SELECT"
  durationMs: number;
  success: boolean;
  status?: number; // HTTP status, when applicable
  error?: string; // failure message, when !success
  traceId?: string; // the request this call was made under, when applicable
  command?: string; // full statement text (postgres) — name keeps only the verb
}

/** The measured fields of a dependency call, minus the boilerplate. */
export interface DependencyFields {
  type: DependencyType;
  target: string;
  name: string;
  durationMs: number;
  success: boolean;
  status?: number;
  error?: string;
  traceId?: string;
  command?: string;
}

/** Build a structured dependency record. Pure and side-effect free. */
export function buildDependency(f: DependencyFields, app: string, nowIso: string = new Date().toISOString()): DependencyLogEntry {
  const entry: DependencyLogEntry = {
    ts: nowIso,
    app,
    kind: 'dependency',
    type: f.type,
    target: f.target,
    name: f.name,
    durationMs: f.durationMs,
    success: f.success,
  };
  if (f.status !== undefined) entry.status = f.status;
  if (f.error !== undefined) entry.error = f.error;
  if (f.command !== undefined) entry.command = f.command;
  const traceId = f.traceId ?? currentTraceId();
  if (traceId !== undefined) entry.traceId = traceId;
  return entry;
}

/** Write a dependency record to dependencies.log. Never throws. */
export function logDependency(f: DependencyFields, app: string): void {
  try {
    depLogStream().write(JSON.stringify(buildDependency(f, app)) + '\n');
  } catch {
    // Logging must never crash the app.
  }
}

// Round hrtime nanoseconds to milliseconds with 3 decimals (matches pageLoadLogger).
function elapsedMs(startNs: bigint): number {
  return Math.round(Number(process.hrtime.bigint() - startNs) / 1e3) / 1e3;
}

// Extract a URL string from fetch's first argument (string | URL | Request),
// duck-typed so it never depends on the Request/URL globals being present.
function fetchUrl(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object' && 'url' in input && typeof (input as { url: unknown }).url === 'string') {
    return (input as { url: string }).url;
  }
  return String(input);
}

function fetchMethod(input: unknown, init: unknown): string {
  const fromInit = init && typeof init === 'object' && 'method' in init ? (init as { method?: unknown }).method : undefined;
  const fromReq = input && typeof input === 'object' && 'method' in input ? (input as { method?: unknown }).method : undefined;
  return String(fromInit ?? fromReq ?? 'GET').toUpperCase();
}

// Split a URL into a host (the dependency target) and path (part of its name),
// tolerating relative or malformed URLs.
function splitUrl(raw: string): { host: string; path: string } {
  try {
    const u = new URL(raw);
    return { host: u.host, path: u.pathname };
  } catch {
    return { host: raw, path: raw };
  }
}

let fetchInstalled = false;

/**
 * Wrap the global `fetch` so each outbound HTTP call is timed and recorded as a
 * DependencyLogEntry (success = res.ok; failures captured with the error message).
 * Idempotent and transparent — arguments and the resolved Response pass through
 * untouched, and logging never alters the result. No-op if fetch is unavailable.
 */
export function installFetchLogging(app: string): void {
  if (fetchInstalled || typeof globalThis.fetch !== 'function') return;
  fetchInstalled = true;
  const original = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> => {
    const start = process.hrtime.bigint();
    const method = fetchMethod(input, init);
    const { host, path } = splitUrl(fetchUrl(input));
    try {
      const res = await original(input, init);
      logDependency(
        { type: 'http', target: host, name: `${method} ${path}`, durationMs: elapsedMs(start), success: res.ok, status: res.status },
        app
      );
      return res;
    } catch (err) {
      logDependency(
        { type: 'http', target: host, name: `${method} ${path}`, durationMs: elapsedMs(start), success: false, error: (err as Error).message },
        app
      );
      throw err;
    }
  }) as typeof fetch;
}

let processHandlersInstalled = false;

/**
 * Install process-level fault handlers that record a first-class exception before
 * the usual console output. `unhandledRejection` is logged; `uncaughtException` is
 * logged and then the process exits non-zero (preserving Node's fail-fast default,
 * which registering a handler would otherwise suppress). Idempotent.
 */
export function installProcessExceptionHandlers(app: string): void {
  if (processHandlersInstalled) return;
  processHandlersInstalled = true;
  process.on('unhandledRejection', (reason) => {
    logException(reason, app, 'unhandledRejection');
    console.error(`[${app}] unhandledRejection`, reason);
  });
  process.on('uncaughtException', (err) => {
    logException(err, app, 'uncaught');
    console.error(`[${app}] uncaughtException`, err);
    // Flush the tail, then exit non-zero as Node would have without a handler.
    void closeLogStreams().finally(() => process.exit(1));
  });
}
