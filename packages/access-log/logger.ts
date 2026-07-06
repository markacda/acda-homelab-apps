import { createStream } from "rotating-file-stream";
import { join } from "node:path";
import type { IncomingHttpHeaders } from "node:http";
import type { RequestHandler } from "express";

// Structured per-request access log. One JSON object per line, written to a
// daily-rotated file. Old files are gzipped and only ~90 are kept, giving a
// ~3-month retention window. LOG_DIR is a persistent volume in Docker.
const LOG_DIR = process.env.LOG_DIR || join(process.cwd(), "logs");

// Lazily open the rotating stream on first write, so importing this module
// (e.g. to unit-test buildEntry) has no filesystem side effects.
let stream: ReturnType<typeof createStream> | undefined;
function logStream(): ReturnType<typeof createStream> {
  if (!stream) {
    stream = createStream("access.log", {
      interval: "1d", // rotate daily
      path: LOG_DIR,
      maxFiles: 90, // keep ~90 days -> 3-month retention
      compress: "gzip", // gzip rotated files to save disk on the Pi
    });
  }
  return stream;
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
