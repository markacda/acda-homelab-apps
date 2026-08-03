import type {
  AccessLogEntry,
  AppLogEntry,
  LogLevel,
  StatusClass,
  LogBand,
  ExceptionLogEntry,
  DependencyLogEntry,
  ExceptionSource,
  TraceItem,
} from '../ValueObjects/log-entry.ts';
import type { LogFilter, AppLogFilter, ExceptionFilter, DependencyFilter } from '../ValueObjects/log-filter.ts';
import type {
  Stats,
  LogStats,
  EndpointStat,
  AppStat,
  LogAppStat,
  ExceptionStats,
  ExceptionProblem,
  DependencyStats,
  DependencyTargetStat,
} from '../ValueObjects/log-stats.ts';

// Pure filtering + aggregation over parsed log entries. No I/O here so it can be
// unit-tested directly, and the query service can reuse it per request.

function inStatusClass(status: number, cls: StatusClass): boolean {
  const base = Number(cls[0]) * 100;
  return status >= base && status < base + 100;
}

function matchesQuery(e: AccessLogEntry, needle: string): boolean {
  const hay = `${e.url ?? ''} ${e.ip ?? ''} ${e.ua ?? ''} ${e.referer ?? ''}`.toLowerCase();
  return hay.includes(needle);
}

/** Apply a filter to entries. Order is preserved (caller sorts upstream). */
export function filterEntries(entries: AccessLogEntry[], f: LogFilter): AccessLogEntry[] {
  const q = f.q?.trim().toLowerCase();
  return entries.filter((e) => {
    if (f.app?.length && !f.app.includes(e.app)) return false;
    if (f.method?.length && !(e.method !== undefined && f.method.includes(e.method))) return false;
    if (f.status !== undefined && e.status !== f.status) return false;
    if (f.statusClass?.length && !f.statusClass.some((c) => inStatusClass(e.status, c))) return false;
    if (f.from && e.ts < f.from) return false;
    if (f.to && e.ts > f.to) return false;
    if (f.excludeApp?.length && f.excludeApp.includes(e.app)) return false;
    if (f.excludeUa?.length && e.ua !== null && f.excludeUa.includes(e.ua)) return false;
    if (q && !matchesQuery(e, q)) return false;
    return true;
  });
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

interface Bucketed {
  count: number;
  totalDuration: number;
  errorCount: number;
}
const emptyBucket = (): Bucketed => ({ count: 0, totalDuration: 0, errorCount: 0 });

function accumulate(b: Bucketed, e: AccessLogEntry): void {
  b.count += 1;
  b.totalDuration += e.durationMs || 0;
  if (e.status >= 400) b.errorCount += 1;
}

/** Pick the time-bucket granularity: hourly for short spans, daily otherwise. */
function bucketKeyFor(entries: { ts: string }[]): (ts: string) => string {
  if (entries.length === 0) return (ts) => ts.slice(0, 10);
  let min = entries[0].ts;
  let max = entries[0].ts;
  for (const e of entries) {
    if (e.ts < min) min = e.ts;
    if (e.ts > max) max = e.ts;
  }
  const spanMs = Date.parse(max) - Date.parse(min);
  const twoDays = 2 * 24 * 60 * 60 * 1000;
  // "YYYY-MM-DDTHH" (hour) vs "YYYY-MM-DD" (day)
  return spanMs <= twoDays ? (ts) => ts.slice(0, 13) : (ts) => ts.slice(0, 10);
}

/** Expand a sparse bucket map into a dense ascending series: one entry per day
 * (or hour) across the full range, filling gaps with an empty value so the chart
 * renders an evenly-spaced empty slot for periods with no entries. Bucket keys are
 * UTC-derived slices of the ISO timestamp, so UTC ms stepping round-trips exactly. */
function densifyBuckets<T>(byBucket: Map<string, T>, empty: () => T): [string, T][] {
  const keys = [...byBucket.keys()].sort();
  if (keys.length === 0) return [];
  const hourly = keys[0].length === 13; // "YYYY-MM-DDTHH" vs "YYYY-MM-DD"
  const stepMs = hourly ? 3_600_000 : 86_400_000;
  const toTime = (k: string): number => Date.parse(hourly ? `${k}:00:00Z` : k);
  const toKey = (t: number): string => new Date(t).toISOString().slice(0, hourly ? 13 : 10);
  const out: [string, T][] = [];
  const end = toTime(keys[keys.length - 1]);
  for (let t = toTime(keys[0]); t <= end; t += stepMs) {
    const k = toKey(t);
    out.push([k, byBucket.get(k) ?? empty()]);
  }
  return out;
}

function topBy<T>(items: T[], key: (t: T) => number, n: number): T[] {
  return [...items].sort((a, b) => key(b) - key(a)).slice(0, n);
}

/** Compute accumulated stats over an already-filtered set of entries. */
export function computeStats(entries: AccessLogEntry[], topN = 10): Stats {
  const overall = emptyBucket();
  let count4xx = 0;
  let count5xx = 0;

  const byApp = new Map<string, Bucketed>();
  const byEndpoint = new Map<string, Bucketed & { app: string; method: string; url: string }>();
  const byStatus = new Map<number, number>();
  const byIp = new Map<string, number>();
  const byUa = new Map<string, number>();
  // Split each bucket into non-overlapping bands (ok = 2xx/3xx) so the stacked
  // chart's total height is the true request count for that bucket.
  const byBucket = new Map<string, { ok: number; c4xx: number; c5xx: number }>();
  const bucketKey = bucketKeyFor(entries);

  for (const e of entries) {
    accumulate(overall, e);
    if (e.status >= 400 && e.status < 500) count4xx += 1;
    if (e.status >= 500) count5xx += 1;

    const app = byApp.get(e.app) ?? emptyBucket();
    accumulate(app, e);
    byApp.set(e.app, app);

    const method = e.method ?? '?';
    const url = e.url ?? '?';
    const ek = `${e.app} ${method} ${url}`;
    const ep = byEndpoint.get(ek) ?? { ...emptyBucket(), app: e.app, method, url };
    accumulate(ep, e);
    byEndpoint.set(ek, ep);

    byStatus.set(e.status, (byStatus.get(e.status) ?? 0) + 1);
    if (e.ip) byIp.set(e.ip, (byIp.get(e.ip) ?? 0) + 1);
    if (e.ua) byUa.set(e.ua, (byUa.get(e.ua) ?? 0) + 1);
    const bk = bucketKey(e.ts);
    const b = byBucket.get(bk) ?? { ok: 0, c4xx: 0, c5xx: 0 };
    if (e.status >= 500) b.c5xx += 1;
    else if (e.status >= 400) b.c4xx += 1;
    else b.ok += 1;
    byBucket.set(bk, b);
  }

  const perApp: AppStat[] = [...byApp.entries()]
    .map(([app, b]) => ({
      app,
      count: b.count,
      avgDurationMs: b.count ? round2(b.totalDuration / b.count) : 0,
      errorCount: b.errorCount,
    }))
    .sort((a, b) => b.count - a.count);

  const endpoints: EndpointStat[] = [...byEndpoint.values()].map((b) => ({
    app: b.app,
    method: b.method,
    url: b.url,
    count: b.count,
    avgDurationMs: b.count ? round2(b.totalDuration / b.count) : 0,
    errorCount: b.errorCount,
  }));

  return {
    overall: {
      count: overall.count,
      avgDurationMs: overall.count ? round2(overall.totalDuration / overall.count) : 0,
      errorCount: overall.errorCount,
      count4xx,
      count5xx,
      errorRate: overall.count ? round2(overall.errorCount / overall.count) : 0,
    },
    perApp,
    perEndpoint: topBy(endpoints, (e) => e.count, topN),
    slowestEndpoints: topBy(
      endpoints.filter((e) => e.count >= 3),
      (e) => e.avgDurationMs,
      topN
    ),
    statusDistribution: [...byStatus.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => a.status - b.status),
    topIps: topBy(
      [...byIp.entries()].map(([ip, count]) => ({ ip, count })),
      (x) => x.count,
      topN
    ),
    topUserAgents: topBy(
      [...byUa.entries()].map(([ua, count]) => ({ ua, count })),
      (x) => x.count,
      topN
    ),
    overTime: densifyBuckets(byBucket, () => ({ ok: 0, c4xx: 0, c5xx: 0 })).map(([bucket, b]) => ({ bucket, ...b })),
  };
}

// ---- application (console) logs -------------------------------------------

function bandFor(level: LogLevel): LogBand {
  if (level === 'error') return 'error';
  if (level === 'warn') return 'warn';
  return 'info'; // log / info / debug
}

/** Apply a filter to app-log entries. Order is preserved (caller sorts upstream). */
export function filterAppLogs(logs: AppLogEntry[], f: AppLogFilter): AppLogEntry[] {
  const q = f.q?.trim().toLowerCase();
  return logs.filter((e) => {
    if (f.app?.length && !f.app.includes(e.app)) return false;
    if (f.level?.length && !f.level.includes(e.level)) return false;
    if (f.from && e.ts < f.from) return false;
    if (f.to && e.ts > f.to) return false;
    if (f.excludeApp?.length && f.excludeApp.includes(e.app)) return false;
    if (q && !e.message.toLowerCase().includes(q)) return false;
    return true;
  });
}

/** Compute accumulated stats over an already-filtered set of app-log entries. */
export function computeLogStats(logs: AppLogEntry[]): LogStats {
  let errorCount = 0;
  let warnCount = 0;
  let infoCount = 0;

  const byApp = new Map<string, LogAppStat>();
  const byLevel = new Map<LogLevel, number>();
  const byBucket = new Map<string, { error: number; warn: number; info: number }>();
  const bucketKey = bucketKeyFor(logs);

  for (const e of logs) {
    const band = bandFor(e.level);
    if (band === 'error') errorCount += 1;
    else if (band === 'warn') warnCount += 1;
    else if (e.level !== 'debug') infoCount += 1; // debug is tracked separately (levelDistribution), not in the Info card

    const app = byApp.get(e.app) ?? { app: e.app, count: 0, errorCount: 0, warnCount: 0 };
    app.count += 1;
    if (band === 'error') app.errorCount += 1;
    else if (band === 'warn') app.warnCount += 1;
    byApp.set(e.app, app);

    byLevel.set(e.level, (byLevel.get(e.level) ?? 0) + 1);

    const bk = bucketKey(e.ts);
    const bucket = byBucket.get(bk) ?? { error: 0, warn: 0, info: 0 };
    bucket[band] += 1;
    byBucket.set(bk, bucket);
  }

  return {
    overall: { count: logs.length, errorCount, warnCount, infoCount },
    perApp: [...byApp.values()].sort((a, b) => b.count - a.count),
    levelDistribution: [...byLevel.entries()].map(([level, count]) => ({ level, count })).sort((a, b) => b.count - a.count),
    overTime: densifyBuckets(byBucket, () => ({ error: 0, warn: 0, info: 0 })).map(([bucket, b]) => ({ bucket, ...b })),
  };
}

// ---- exceptions -----------------------------------------------------------

/** Apply a filter to exception records. Order is preserved (caller sorts upstream). */
export function filterExceptions(items: ExceptionLogEntry[], f: ExceptionFilter): ExceptionLogEntry[] {
  const q = f.q?.trim().toLowerCase();
  return items.filter((e) => {
    if (f.app?.length && !f.app.includes(e.app)) return false;
    if (f.source?.length && !f.source.includes(e.source)) return false;
    if (f.from && e.ts < f.from) return false;
    if (f.to && e.ts > f.to) return false;
    if (f.excludeApp?.length && f.excludeApp.includes(e.app)) return false;
    if (q && !`${e.name} ${e.message}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

/** Compute accumulated stats over an already-filtered set of exceptions. */
export function computeExceptionStats(items: ExceptionLogEntry[], topN = 10): ExceptionStats {
  interface ProblemAcc {
    name: string;
    message: string;
    count: number;
    lastSeen: string;
    apps: Set<string>;
  }
  const byProblem = new Map<string, ProblemAcc>();
  const byApp = new Map<string, number>();
  const bySource = new Map<ExceptionSource, number>();
  const byBucket = new Map<string, { count: number }>();
  const bucketKey = bucketKeyFor(items);

  for (const e of items) {
    // Group distinct faults by name + message (NUL-joined to avoid collisions).
    const key = `${e.name}\u0000${e.message}`;
    const p = byProblem.get(key) ?? { name: e.name, message: e.message, count: 0, lastSeen: e.ts, apps: new Set<string>() };
    p.count += 1;
    if (e.ts > p.lastSeen) p.lastSeen = e.ts;
    p.apps.add(e.app);
    byProblem.set(key, p);

    byApp.set(e.app, (byApp.get(e.app) ?? 0) + 1);
    bySource.set(e.source, (bySource.get(e.source) ?? 0) + 1);

    const bk = bucketKey(e.ts);
    const b = byBucket.get(bk) ?? { count: 0 };
    b.count += 1;
    byBucket.set(bk, b);
  }

  const problems: ExceptionProblem[] = [...byProblem.values()]
    .map((p) => ({ name: p.name, message: p.message, count: p.count, lastSeen: p.lastSeen, apps: [...p.apps].sort() }))
    .sort((a, b) => b.count - a.count);

  return {
    overall: { count: items.length, problemCount: byProblem.size, appCount: byApp.size },
    problems: problems.slice(0, topN),
    perApp: [...byApp.entries()].map(([app, count]) => ({ app, count })).sort((a, b) => b.count - a.count),
    bySource: [...bySource.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
    overTime: densifyBuckets(byBucket, () => ({ count: 0 })).map(([bucket, b]) => ({ bucket, ...b })),
  };
}

// ---- dependencies ---------------------------------------------------------

/** The p-th percentile of an ascending-sorted array (nearest-rank). 0 if empty. */
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const rank = Math.ceil(p * sortedAsc.length);
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, rank - 1));
  return sortedAsc[idx];
}

/** Apply a filter to dependency records. Order is preserved (caller sorts upstream). */
export function filterDependencies(items: DependencyLogEntry[], f: DependencyFilter): DependencyLogEntry[] {
  const q = f.q?.trim().toLowerCase();
  return items.filter((e) => {
    if (f.app?.length && !f.app.includes(e.app)) return false;
    if (f.type?.length && !f.type.includes(e.type)) return false;
    if (f.target?.length && !f.target.includes(e.target)) return false;
    if (f.outcome === 'success' && !e.success) return false;
    if (f.outcome === 'failure' && e.success) return false;
    if (f.from && e.ts < f.from) return false;
    if (f.to && e.ts > f.to) return false;
    if (f.excludeApp?.length && f.excludeApp.includes(e.app)) return false;
    if (q && !`${e.name} ${e.target}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

/** Compute accumulated stats over an already-filtered set of dependency calls. */
export function computeDependencyStats(items: DependencyLogEntry[], topN = 10): DependencyStats {
  interface TargetAcc {
    target: string;
    type: DependencyLogEntry['type'];
    count: number;
    failureCount: number;
    durations: number[];
  }
  let failureCount = 0;
  const allDurations: number[] = [];
  const byTarget = new Map<string, TargetAcc>();
  const byApp = new Map<string, { count: number; failureCount: number; totalDuration: number }>();
  const byBucket = new Map<string, { ok: number; failed: number }>();
  const bucketKey = bucketKeyFor(items);

  for (const e of items) {
    const dur = e.durationMs || 0;
    allDurations.push(dur);
    if (!e.success) failureCount += 1;

    const tkey = `${e.type}\u0000${e.target}`;
    const t = byTarget.get(tkey) ?? { target: e.target, type: e.type, count: 0, failureCount: 0, durations: [] };
    t.count += 1;
    if (!e.success) t.failureCount += 1;
    t.durations.push(dur);
    byTarget.set(tkey, t);

    const a = byApp.get(e.app) ?? { count: 0, failureCount: 0, totalDuration: 0 };
    a.count += 1;
    if (!e.success) a.failureCount += 1;
    a.totalDuration += dur;
    byApp.set(e.app, a);

    const bk = bucketKey(e.ts);
    const b = byBucket.get(bk) ?? { ok: 0, failed: 0 };
    if (e.success) b.ok += 1;
    else b.failed += 1;
    byBucket.set(bk, b);
  }

  const targets: DependencyTargetStat[] = [...byTarget.values()].map((t) => {
    const sorted = [...t.durations].sort((x, y) => x - y);
    const total = sorted.reduce((s, d) => s + d, 0);
    return {
      target: t.target,
      type: t.type,
      count: t.count,
      failureCount: t.failureCount,
      avgDurationMs: t.count ? round2(total / t.count) : 0,
      p95DurationMs: round2(percentile(sorted, 0.95)),
    };
  });

  const sortedAll = [...allDurations].sort((a, b) => a - b);
  const totalAll = sortedAll.reduce((s, d) => s + d, 0);

  return {
    overall: {
      count: items.length,
      failureCount,
      failureRate: items.length ? round2(failureCount / items.length) : 0,
      avgDurationMs: items.length ? round2(totalAll / items.length) : 0,
      p95DurationMs: round2(percentile(sortedAll, 0.95)),
    },
    perTarget: topBy(targets, (t) => t.count, topN),
    perApp: [...byApp.entries()]
      .map(([app, a]) => ({ app, count: a.count, failureCount: a.failureCount, avgDurationMs: a.count ? round2(a.totalDuration / a.count) : 0 }))
      .sort((a, b) => b.count - a.count),
    slowest: topBy(
      targets.filter((t) => t.count >= 3),
      (t) => t.p95DurationMs,
      topN
    ),
    overTime: densifyBuckets(byBucket, () => ({ ok: 0, failed: 0 })).map(([bucket, b]) => ({ bucket, ...b })),
  };
}

// ---- trace timeline -------------------------------------------------------

/** The four record kinds available to correlate under one trace id. */
export interface TraceSources {
  requests: AccessLogEntry[];
  logs: AppLogEntry[];
  exceptions: ExceptionLogEntry[];
  dependencies: DependencyLogEntry[];
}

/**
 * Gather every record sharing `traceId` across all four kinds into a single
 * timeline, ordered by timestamp ascending. Records with no `traceId` (or a
 * different one) are skipped. Each item is tagged with its kind so the two kinds
 * that lack a `kind` field (requests, app-logs) stay distinguishable. Pure — the
 * `ts` values are ISO strings, so ascending order is a plain string compare.
 */
export function collectTrace(traceId: string, sources: TraceSources): TraceItem[] {
  const items: TraceItem[] = [];
  for (const entry of sources.requests) if (entry.traceId === traceId) items.push({ kind: 'request', entry });
  for (const entry of sources.logs) if (entry.traceId === traceId) items.push({ kind: 'log', entry });
  for (const entry of sources.exceptions) if (entry.traceId === traceId) items.push({ kind: 'exception', entry });
  for (const entry of sources.dependencies) if (entry.traceId === traceId) items.push({ kind: 'dependency', entry });
  return items.sort((a, b) => (a.entry.ts < b.entry.ts ? -1 : a.entry.ts > b.entry.ts ? 1 : 0));
}
