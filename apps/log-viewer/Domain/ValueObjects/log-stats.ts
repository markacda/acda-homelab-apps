import type { LogLevel } from "./log-entry.ts";

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
  statusDistribution: { status: number; count: number }[];
  topIps: { ip: string; count: number }[];
  topUserAgents: { ua: string; count: number }[];
  overTime: { bucket: string; count: number }[]; // ascending; hour or day buckets
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
    infoCount: number; // log / info / debug
  };
  perApp: LogAppStat[];
  levelDistribution: { level: LogLevel; count: number }[];
  // Ascending time series, split into the three bands for a stacked chart.
  overTime: { bucket: string; error: number; warn: number; info: number }[];
}
