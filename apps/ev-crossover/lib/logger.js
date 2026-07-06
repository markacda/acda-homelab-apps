import { createStream } from "rotating-file-stream";
import { join } from "node:path";

// Structured per-request access log. One JSON object per line, written to a
// daily-rotated file. Old files are gzipped and only ~90 are kept, giving a
// ~3-month retention window. LOG_DIR is a persistent volume in Docker.
const LOG_DIR = process.env.LOG_DIR || join(process.cwd(), "logs");

// Lazily open the rotating stream on first write, so importing this module
// (e.g. to unit-test buildEntry) has no filesystem side effects.
let stream;
function logStream() {
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

/**
 * Build a structured access-log entry from a finished request/response.
 * Pure and side-effect free so it can be unit-tested without a real socket.
 */
export function buildEntry(req, res, durationMs, app, nowIso = new Date().toISOString()) {
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
export function pageLoadLogger(app) {
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
