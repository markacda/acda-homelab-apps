import { createStream } from 'rotating-file-stream'
import { join } from 'node:path'
import { format } from 'node:util'
import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'node:http'
import type { RequestHandler } from 'express'

export { DISCOVERY_UA } from './constants.ts'

// Structured per-request access log. One JSON object per line, written to a
// daily-rotated file. Old files are gzipped and only ~30 are kept, giving a
// ~1-month retention window. LOG_DIR is a persistent volume in Docker.
const LOG_DIR = process.env.LOG_DIR || join(process.cwd(), 'logs')

// Shared rotation options for both the access log and the app (console) log.
const ROTATE_OPTS = {
  interval: '1d', // rotate daily
  path: LOG_DIR,
  maxFiles: 30, // keep ~30 days -> 1-month retention
  compress: 'gzip', // gzip rotated files to save disk on the Pi
} as const

// Lazily open the rotating stream on first write, so importing this module
// (e.g. to unit-test buildEntry) has no filesystem side effects.
let stream: ReturnType<typeof createStream> | undefined
function logStream(): ReturnType<typeof createStream> {
  if (!stream) {
    stream = createStream('access.log', ROTATE_OPTS)
  }
  return stream
}

// Second rotating stream for application (console) logs, kept in the same
// LOG_DIR so it rides the Log Viewer's existing read-only volume mounts.
let appStream: ReturnType<typeof createStream> | undefined
function appLogStream(): ReturnType<typeof createStream> {
  if (!appStream) {
    appStream = createStream('app.log', ROTATE_OPTS)
  }
  return appStream
}

/**
 * Flush and close both rotating log streams, resolving once the OS has the
 * buffered data. Call on graceful shutdown so the tail of the log isn't lost
 * when the process exits. A no-op (resolves immediately) if neither stream was
 * ever opened.
 */
export function closeLogStreams(): Promise<void> {
  const open = [stream, appStream].filter((s): s is NonNullable<typeof s> => Boolean(s))
  return Promise.all(open.map((s) => new Promise<void>((resolve) => s.end(resolve)))).then(() => undefined)
}

// Health-check polls hit every 30s; keep them out of the page-load log.
const SKIP_PATHS = new Set(['/healthz', '/health'])

// buildEntry only reads these fields, so it accepts anything structurally
// compatible: a real Express req/res and the lightweight test doubles alike.
interface LoggableRequest {
  method?: string
  originalUrl?: string
  url?: string
  ip?: string
  socket?: { remoteAddress?: string }
  headers?: IncomingHttpHeaders
}

interface LoggableResponse {
  statusCode: number
  getHeader?: (name: string) => number | string | string[] | undefined
  getHeaders?: () => OutgoingHttpHeaders
}

export interface AccessLogEntry {
  ts: string
  app: string
  method: string | undefined
  url: string | undefined
  status: number
  durationMs: number
  ip: string | null
  ua: string | null
  referer: string | null
  bytes: number | null
  // Present only for non-2xx responses: the full response header map (with
  // sensitive values redacted) and a size-bounded copy of the response body.
  // Omitted entirely on 2xx to keep the common case's log lines small.
  resHeaders?: Record<string, string | number | string[]>
  resBody?: string
  resBodyTruncated?: boolean
}

// A response is "interesting" (worth capturing headers + body for) when it is
// anything other than a 2xx success.
function isNon2xx(status: number): boolean {
  return status < 200 || status >= 300
}

// Cap the captured response body so a large error page can't bloat a log line.
export const BODY_CAP = 32 * 1024

// Content-types whose bodies are worth capturing as text. Anything else is
// stored as a short placeholder rather than mojibake.
const TEXT_CT = /\b(json|text|xml|html|x-www-form-urlencoded)\b/i

// Response header values that must never be persisted verbatim in long-lived logs.
const REDACT_HEADERS = new Set(['set-cookie', 'authorization'])

/** Copy the response header map, redacting the values of sensitive headers. */
function redactHeaders(headers: OutgoingHttpHeaders): Record<string, string | number | string[]> {
  const out: Record<string, string | number | string[]> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue
    out[key] = REDACT_HEADERS.has(key.toLowerCase()) ? '[redacted]' : value
  }
  return out
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
  resBodyTruncated?: boolean
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
  }
  if (isNon2xx(res.statusCode)) {
    const headers = res.getHeaders?.()
    if (headers) entry.resHeaders = redactHeaders(headers)
    if (resBody !== undefined) entry.resBody = resBody
    if (resBodyTruncated) entry.resBodyTruncated = true
  }
  return entry
}

/** Express middleware that writes one JSON line per request to the rotating log. */
export function pageLoadLogger(app: string): RequestHandler {
  return (req, res, next) => {
    if (SKIP_PATHS.has(req.path)) return next()
    const start = process.hrtime.bigint()

    // Buffer the response body as it's written so it's still available at
    // "finish" (which fires after the body has been flushed). Only non-2xx
    // bodies are kept, capped at BODY_CAP bytes.
    const chunks: Buffer[] = []
    let size = 0
    let truncated = false
    const capture = (chunk: unknown): void => {
      if (!isNon2xx(res.statusCode) || size >= BODY_CAP) return
      const buf = Buffer.isBuffer(chunk) ? chunk : typeof chunk === 'string' ? Buffer.from(chunk) : undefined
      if (!buf) return
      const room = BODY_CAP - size
      if (buf.length > room) {
        chunks.push(buf.subarray(0, room))
        size = BODY_CAP
        truncated = true
      } else {
        chunks.push(buf)
        size += buf.length
      }
    }

    const origWrite = res.write.bind(res)
    const origEnd = res.end.bind(res)
    res.write = ((chunk: unknown, ...rest: unknown[]) => {
      capture(chunk)
      return (origWrite as (...args: unknown[]) => unknown)(chunk, ...rest)
    }) as typeof res.write
    res.end = ((chunk?: unknown, ...rest: unknown[]) => {
      // res.end(cb) passes the callback as the first arg — don't treat it as a body chunk.
      if (typeof chunk !== 'function') capture(chunk)
      return (origEnd as (...args: unknown[]) => unknown)(chunk, ...rest)
    }) as typeof res.end

    res.on('finish', () => {
      const durationMs = Math.round(Number(process.hrtime.bigint() - start) / 1e3) / 1e3
      let body: string | undefined
      let bodyTruncated = false
      if (isNon2xx(res.statusCode) && size > 0) {
        const ct = String(res.getHeader?.('content-type') ?? '')
        if (TEXT_CT.test(ct)) {
          body = Buffer.concat(chunks).toString('utf8')
          bodyTruncated = truncated // truncation only meaningful for the captured text
        } else {
          body = `[binary, ${size} bytes, ${ct || 'unknown content-type'}]`
        }
      }
      logStream().write(JSON.stringify(buildEntry(req, res, durationMs, app, undefined, body, bodyTruncated)) + '\n')
    })
    next()
  }
}

// ---- application (console) logging ----------------------------------------

// The console methods we mirror into app.log. `erasableSyntaxOnly` forbids
// enums, so this is a plain const tuple.
export const LOG_LEVELS = ['log', 'info', 'warn', 'error', 'debug'] as const
export type LogLevel = (typeof LOG_LEVELS)[number]

// A structured application-log record: one JSON object per line in app.log.
// Distinct from AccessLogEntry (which has `status`) by its `level`/`message`.
export interface AppLogEntry {
  ts: string
  app: string
  level: LogLevel
  message: string // human-readable, util.format(...args)
  params: unknown[] // JSON-safe per-argument values, for structured display
}

/** Make a single console argument JSON-safe for the `params` array. */
function safeParam(arg: unknown): unknown {
  if (arg instanceof Error) {
    return { name: arg.name, message: arg.message, stack: arg.stack }
  }
  if (arg === null || typeof arg !== 'object') return arg // primitives pass through
  try {
    // Round-trip through JSON so only serializable data survives (drops
    // functions, handles nested structures, and surfaces any toJSON()).
    return JSON.parse(JSON.stringify(arg))
  } catch {
    return String(arg) // circular refs / non-serializable -> best-effort string
  }
}

/**
 * Build a structured application-log entry from console arguments.
 * Pure and side-effect free so it can be unit-tested (inject `nowIso`).
 */
export function buildAppLogEntry(level: LogLevel, args: unknown[], app: string, nowIso: string = new Date().toISOString()): AppLogEntry {
  return {
    ts: nowIso,
    app,
    level,
    message: format(...args),
    params: args.map(safeParam),
  }
}

let consoleInstalled = false

/**
 * Wrap console.{log,info,warn,error,debug} so each call ALSO writes a structured
 * AppLogEntry line to app.log, in addition to its normal stdout/stderr output.
 * Idempotent; call once at app startup before other code logs.
 */
export function installConsoleLogging(app: string): void {
  if (consoleInstalled) return
  consoleInstalled = true
  for (const level of LOG_LEVELS) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]): void => {
      original(...args) // keep the normal stdout/stderr output intact
      try {
        appLogStream().write(JSON.stringify(buildAppLogEntry(level, args, app)) + '\n')
      } catch {
        // Logging must never crash the app; drop the line on any write error.
      }
    }
  }
}
