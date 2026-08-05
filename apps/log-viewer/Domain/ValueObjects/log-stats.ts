import type { LogLevel, ExceptionSource, DependencyType } from './log-entry.ts';

// Aggregated statistics produced by the analytics domain service.

export interface EndpointStat {
  app: string;
  method: string;
  url: string;
  count: number;
  avgDurationMs: number;
  errorCount: number;
}

export interface AppStat {
  app: string;
  count: number;
  avgDurationMs: number;
  errorCount: number;
}

/** A single slow request (not an endpoint average) — the raw entry, projected. */
export interface SlowRequest {
  app: string;
  method: string;
  url: string;
  status: number;
  durationMs: number;
  ts: string;
}

export interface Stats {
  overall: {
    count: number;
    avgDurationMs: number;
    errorCount: number;
    count4xx: number;
    count5xx: number;
    errorRate: number; // fraction 0..1
  };
  perApp: AppStat[];
  perEndpoint: EndpointStat[]; // top N by request count
  slowestEndpoints: EndpointStat[]; // top N by avg duration (min 3 requests)
  slowestRequests: SlowRequest[]; // top N individual requests by duration
  statusDistribution: { status: number; count: number }[];
  topIps: { ip: string; count: number }[];
  topUserAgents: { ua: string; count: number }[];
  // Ascending time series, split into non-overlapping bands (ok = 2xx/3xx) for a
  // stacked chart. Hour or day buckets.
  overTime: { bucket: string; ok: number; c4xx: number; c5xx: number }[];
}

export interface LogAppStat {
  app: string;
  count: number;
  errorCount: number;
  warnCount: number;
}

export interface LogStats {
  overall: {
    count: number;
    errorCount: number; // level === "error"
    warnCount: number; // level === "warn"
    infoCount: number; // log / info (debug excluded)
  };
  perApp: LogAppStat[];
  levelDistribution: { level: LogLevel; count: number }[];
  // Ascending time series, split into the three bands for a stacked chart.
  overTime: { bucket: string; error: number; warn: number; info: number }[];
}

/** A distinct fault (grouped by name + message) and how often it recurs. */
export interface ExceptionProblem {
  name: string;
  message: string;
  count: number;
  lastSeen: string; // ISO ts of the most recent occurrence
  apps: string[]; // apps this problem was seen in
}

export interface ExceptionStats {
  overall: {
    count: number; // total exceptions
    problemCount: number; // distinct name+message groups
    appCount: number; // apps with ≥1 exception
  };
  problems: ExceptionProblem[]; // top N by count
  perApp: { app: string; count: number }[];
  bySource: { source: ExceptionSource; count: number }[];
  // Ascending time series (single band) for a bar chart.
  overTime: { bucket: string; count: number }[];
}

export interface DependencyTargetStat {
  target: string;
  type: DependencyType;
  count: number;
  failureCount: number;
  avgDurationMs: number;
  p95DurationMs: number;
}

export interface DependencyStats {
  overall: {
    count: number;
    failureCount: number;
    failureRate: number; // fraction 0..1
    avgDurationMs: number;
    p95DurationMs: number;
  };
  perTarget: DependencyTargetStat[]; // top N by count
  perApp: { app: string; count: number; failureCount: number; avgDurationMs: number }[];
  slowest: DependencyTargetStat[]; // top N by p95 (min 3 calls)
  // Ascending time series, split into ok/failed bands for a stacked chart.
  overTime: { bucket: string; ok: number; failed: number }[];
}
