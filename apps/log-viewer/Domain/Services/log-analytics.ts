import type { AccessLogEntry, AppLogEntry, LogLevel, StatusClass, LogBand } from '../ValueObjects/log-entry.ts'
import type { LogFilter, AppLogFilter } from '../ValueObjects/log-filter.ts'
import type { Stats, LogStats, EndpointStat, AppStat, LogAppStat } from '../ValueObjects/log-stats.ts'

// Pure filtering + aggregation over parsed log entries. No I/O here so it can be
// unit-tested directly, and the query service can reuse it per request.

function inStatusClass(status: number, cls: StatusClass): boolean {
  const base = Number(cls[0]) * 100
  return status >= base && status < base + 100
}

function matchesQuery(e: AccessLogEntry, needle: string): boolean {
  const hay = `${e.url ?? ''} ${e.ip ?? ''} ${e.ua ?? ''} ${e.referer ?? ''}`.toLowerCase()
  return hay.includes(needle)
}

/** Apply a filter to entries. Order is preserved (caller sorts upstream). */
export function filterEntries(entries: AccessLogEntry[], f: LogFilter): AccessLogEntry[] {
  const q = f.q?.trim().toLowerCase()
  return entries.filter((e) => {
    if (f.app?.length && !f.app.includes(e.app)) return false
    if (f.method?.length && !(e.method !== undefined && f.method.includes(e.method))) return false
    if (f.status !== undefined && e.status !== f.status) return false
    if (f.statusClass?.length && !f.statusClass.some((c) => inStatusClass(e.status, c))) return false
    if (f.from && e.ts < f.from) return false
    if (f.to && e.ts > f.to) return false
    if (f.excludeApp?.length && f.excludeApp.includes(e.app)) return false
    if (f.excludeUa?.length && e.ua !== null && f.excludeUa.includes(e.ua)) return false
    if (q && !matchesQuery(e, q)) return false
    return true
  })
}

const round2 = (n: number): number => Math.round(n * 100) / 100

interface Bucketed {
  count: number
  totalDuration: number
  errorCount: number
}
const emptyBucket = (): Bucketed => ({ count: 0, totalDuration: 0, errorCount: 0 })

function accumulate(b: Bucketed, e: AccessLogEntry): void {
  b.count += 1
  b.totalDuration += e.durationMs || 0
  if (e.status >= 400) b.errorCount += 1
}

/** Pick the time-bucket granularity: hourly for short spans, daily otherwise. */
function bucketKeyFor(entries: { ts: string }[]): (ts: string) => string {
  if (entries.length === 0) return (ts) => ts.slice(0, 10)
  let min = entries[0].ts
  let max = entries[0].ts
  for (const e of entries) {
    if (e.ts < min) min = e.ts
    if (e.ts > max) max = e.ts
  }
  const spanMs = Date.parse(max) - Date.parse(min)
  const twoDays = 2 * 24 * 60 * 60 * 1000
  // "YYYY-MM-DDTHH" (hour) vs "YYYY-MM-DD" (day)
  return spanMs <= twoDays ? (ts) => ts.slice(0, 13) : (ts) => ts.slice(0, 10)
}

function topBy<T>(items: T[], key: (t: T) => number, n: number): T[] {
  return [...items].sort((a, b) => key(b) - key(a)).slice(0, n)
}

/** Compute accumulated stats over an already-filtered set of entries. */
export function computeStats(entries: AccessLogEntry[], topN = 10): Stats {
  const overall = emptyBucket()
  let count4xx = 0
  let count5xx = 0

  const byApp = new Map<string, Bucketed>()
  const byEndpoint = new Map<string, Bucketed & { app: string; method: string; url: string }>()
  const byStatus = new Map<number, number>()
  const byIp = new Map<string, number>()
  const byUa = new Map<string, number>()
  const byBucket = new Map<string, number>()
  const bucketKey = bucketKeyFor(entries)

  for (const e of entries) {
    accumulate(overall, e)
    if (e.status >= 400 && e.status < 500) count4xx += 1
    if (e.status >= 500) count5xx += 1

    const app = byApp.get(e.app) ?? emptyBucket()
    accumulate(app, e)
    byApp.set(e.app, app)

    const method = e.method ?? '?'
    const url = e.url ?? '?'
    const ek = `${e.app} ${method} ${url}`
    const ep = byEndpoint.get(ek) ?? { ...emptyBucket(), app: e.app, method, url }
    accumulate(ep, e)
    byEndpoint.set(ek, ep)

    byStatus.set(e.status, (byStatus.get(e.status) ?? 0) + 1)
    if (e.ip) byIp.set(e.ip, (byIp.get(e.ip) ?? 0) + 1)
    if (e.ua) byUa.set(e.ua, (byUa.get(e.ua) ?? 0) + 1)
    const bk = bucketKey(e.ts)
    byBucket.set(bk, (byBucket.get(bk) ?? 0) + 1)
  }

  const perApp: AppStat[] = [...byApp.entries()]
    .map(([app, b]) => ({
      app,
      count: b.count,
      avgDurationMs: b.count ? round2(b.totalDuration / b.count) : 0,
      errorCount: b.errorCount,
    }))
    .sort((a, b) => b.count - a.count)

  const endpoints: EndpointStat[] = [...byEndpoint.values()].map((b) => ({
    app: b.app,
    method: b.method,
    url: b.url,
    count: b.count,
    avgDurationMs: b.count ? round2(b.totalDuration / b.count) : 0,
    errorCount: b.errorCount,
  }))

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
    overTime: [...byBucket.entries()]
      .map(([bucket, count]) => ({ bucket, count }))
      .sort((a, b) => (a.bucket < b.bucket ? -1 : a.bucket > b.bucket ? 1 : 0)),
  }
}

// ---- application (console) logs -------------------------------------------

function bandFor(level: LogLevel): LogBand {
  if (level === 'error') return 'error'
  if (level === 'warn') return 'warn'
  return 'info' // log / info / debug
}

/** Apply a filter to app-log entries. Order is preserved (caller sorts upstream). */
export function filterAppLogs(logs: AppLogEntry[], f: AppLogFilter): AppLogEntry[] {
  const q = f.q?.trim().toLowerCase()
  return logs.filter((e) => {
    if (f.app?.length && !f.app.includes(e.app)) return false
    if (f.level?.length && !f.level.includes(e.level)) return false
    if (f.from && e.ts < f.from) return false
    if (f.to && e.ts > f.to) return false
    if (f.excludeApp?.length && f.excludeApp.includes(e.app)) return false
    if (q && !e.message.toLowerCase().includes(q)) return false
    return true
  })
}

/** Compute accumulated stats over an already-filtered set of app-log entries. */
export function computeLogStats(logs: AppLogEntry[]): LogStats {
  let errorCount = 0
  let warnCount = 0
  let infoCount = 0

  const byApp = new Map<string, LogAppStat>()
  const byLevel = new Map<LogLevel, number>()
  const byBucket = new Map<string, { error: number; warn: number; info: number }>()
  const bucketKey = bucketKeyFor(logs)

  for (const e of logs) {
    const band = bandFor(e.level)
    if (band === 'error') errorCount += 1
    else if (band === 'warn') warnCount += 1
    else infoCount += 1

    const app = byApp.get(e.app) ?? { app: e.app, count: 0, errorCount: 0, warnCount: 0 }
    app.count += 1
    if (band === 'error') app.errorCount += 1
    else if (band === 'warn') app.warnCount += 1
    byApp.set(e.app, app)

    byLevel.set(e.level, (byLevel.get(e.level) ?? 0) + 1)

    const bk = bucketKey(e.ts)
    const bucket = byBucket.get(bk) ?? { error: 0, warn: 0, info: 0 }
    bucket[band] += 1
    byBucket.set(bk, bucket)
  }

  return {
    overall: { count: logs.length, errorCount, warnCount, infoCount },
    perApp: [...byApp.values()].sort((a, b) => b.count - a.count),
    levelDistribution: [...byLevel.entries()].map(([level, count]) => ({ level, count })).sort((a, b) => b.count - a.count),
    overTime: [...byBucket.entries()]
      .map(([bucket, b]) => ({ bucket, ...b }))
      .sort((a, b) => (a.bucket < b.bucket ? -1 : a.bucket > b.bucket ? 1 : 0)),
  }
}
