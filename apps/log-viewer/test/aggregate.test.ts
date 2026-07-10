import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterEntries, computeStats, filterAppLogs, computeLogStats } from '../Domain/Services/log-analytics.ts';
import type { AccessLogEntry, AppLogEntry } from '../Domain/ValueObjects/log-entry.ts';
import { DISCOVERY_UA } from '../../Common/access-log/constants.ts';

function entry(over: Partial<AccessLogEntry>): AccessLogEntry {
  return {
    ts: '2026-07-06T10:00:00.000Z',
    app: 'atc',
    method: 'GET',
    url: '/',
    status: 200,
    durationMs: 10,
    ip: '10.0.0.1',
    ua: 'curl',
    referer: null,
    bytes: 100,
    ...over,
  };
}

const sample: AccessLogEntry[] = [
  entry({ app: 'atc', url: '/planes', status: 200, durationMs: 20, ts: '2026-07-06T10:00:00Z' }),
  entry({ app: 'atc', url: '/planes', status: 500, durationMs: 40, ts: '2026-07-06T10:01:00Z' }),
  entry({ app: 'ev', url: '/calc', status: 404, durationMs: 6, ts: '2026-07-06T10:02:00Z' }),
  entry({ app: 'ev', url: '/calc', status: 200, durationMs: 4, ts: '2026-07-06T10:03:00Z' }),
];

test('filterEntries: by app', () => {
  assert.equal(filterEntries(sample, { app: ['atc'] }).length, 2);
});

test('filterEntries: by multiple apps (match ANY)', () => {
  assert.equal(filterEntries(sample, { app: ['atc', 'ev'] }).length, 4);
});

test('filterEntries: empty app array means no filter', () => {
  assert.equal(filterEntries(sample, { app: [] }).length, 4);
});

test('filterEntries: by statusClass', () => {
  const errs = filterEntries(sample, { statusClass: ['5xx'] });
  assert.equal(errs.length, 1);
  assert.equal(errs[0].status, 500);
});

test('filterEntries: by multiple statusClasses (match ANY)', () => {
  const errs = filterEntries(sample, { statusClass: ['4xx', '5xx'] });
  assert.equal(errs.length, 2);
});

test('filterEntries: by method (case handled upstream)', () => {
  assert.equal(filterEntries(sample, { method: ['GET'] }).length, 4);
  assert.equal(filterEntries(sample, { method: ['POST'] }).length, 0);
});

test('filterEntries: excludeApp drops matching apps', () => {
  const r = filterEntries(sample, { excludeApp: ['atc'] });
  assert.equal(r.length, 2);
  assert.ok(r.every((e) => e.app === 'ev'));
});

test('filterEntries: excludeUa drops matching user-agents', () => {
  const withBot = [...sample, entry({ app: 'ev', ua: DISCOVERY_UA })];
  const r = filterEntries(withBot, { excludeUa: [DISCOVERY_UA] });
  assert.equal(r.length, 4);
  assert.ok(r.every((e) => e.ua !== DISCOVERY_UA));
});

test('filterEntries: by q substring over url', () => {
  assert.equal(filterEntries(sample, { q: 'PLANES' }).length, 2);
});

test('filterEntries: by time range (inclusive)', () => {
  const r = filterEntries(sample, { from: '2026-07-06T10:01:00Z', to: '2026-07-06T10:02:00Z' });
  assert.equal(r.length, 2);
});

test('computeStats: overall counts, avg and error rate', () => {
  const s = computeStats(sample);
  assert.equal(s.overall.count, 4);
  assert.equal(s.overall.avgDurationMs, 17.5); // (20+40+6+4)/4
  assert.equal(s.overall.errorCount, 2); // 500 + 404
  assert.equal(s.overall.count4xx, 1);
  assert.equal(s.overall.count5xx, 1);
  assert.equal(s.overall.errorRate, 0.5);
});

test('computeStats: perApp and perEndpoint aggregation', () => {
  const s = computeStats(sample);
  const atc = s.perApp.find((a) => a.app === 'atc')!;
  assert.equal(atc.count, 2);
  assert.equal(atc.avgDurationMs, 30); // (20+40)/2
  assert.equal(atc.errorCount, 1);

  const planes = s.perEndpoint.find((e) => e.url === '/planes')!;
  assert.equal(planes.count, 2);
  assert.equal(planes.app, 'atc');
  assert.equal(planes.method, 'GET');
});

test('computeStats: status distribution sorted ascending', () => {
  const s = computeStats(sample);
  assert.deepEqual(
    s.statusDistribution.map((d) => d.status),
    [200, 404, 500]
  );
});

// ---- application logs -----------------------------------------------------

function logEntry(over: Partial<AppLogEntry>): AppLogEntry {
  return {
    ts: '2026-07-06T10:00:00.000Z',
    app: 'atc',
    level: 'info',
    message: 'hello world',
    params: [],
    ...over,
  };
}

const logSample: AppLogEntry[] = [
  logEntry({ app: 'atc', level: 'info', message: 'starting up', ts: '2026-07-06T10:00:00Z' }),
  logEntry({ app: 'atc', level: 'error', message: 'fetch failed', ts: '2026-07-06T10:01:00Z' }),
  logEntry({ app: 'ev', level: 'warn', message: 'config missing', ts: '2026-07-06T10:02:00Z' }),
  logEntry({ app: 'ev', level: 'debug', message: 'trace details', ts: '2026-07-06T10:03:00Z' }),
];

test('filterAppLogs: by app', () => {
  assert.equal(filterAppLogs(logSample, { app: ['atc'] }).length, 2);
});

test('filterAppLogs: by level (match ANY)', () => {
  const r = filterAppLogs(logSample, { level: ['error', 'warn'] });
  assert.equal(r.length, 2);
});

test('filterAppLogs: by q substring over message (case-insensitive)', () => {
  assert.equal(filterAppLogs(logSample, { q: 'FAILED' }).length, 1);
});

test('filterAppLogs: excludeApp drops matching apps', () => {
  const r = filterAppLogs(logSample, { excludeApp: ['atc'] });
  assert.equal(r.length, 2);
  assert.ok(r.every((e) => e.app === 'ev'));
});

test('filterAppLogs: by time range (inclusive)', () => {
  const r = filterAppLogs(logSample, { from: '2026-07-06T10:01:00Z', to: '2026-07-06T10:02:00Z' });
  assert.equal(r.length, 2);
});

test('computeLogStats: overall banded counts', () => {
  const s = computeLogStats(logSample);
  assert.equal(s.overall.count, 4);
  assert.equal(s.overall.errorCount, 1);
  assert.equal(s.overall.warnCount, 1);
  assert.equal(s.overall.infoCount, 2); // info + debug
});

test('computeLogStats: perApp with error/warn breakdown', () => {
  const s = computeLogStats(logSample);
  const atc = s.perApp.find((a) => a.app === 'atc')!;
  assert.equal(atc.count, 2);
  assert.equal(atc.errorCount, 1);
  assert.equal(atc.warnCount, 0);
  const ev = s.perApp.find((a) => a.app === 'ev')!;
  assert.equal(ev.warnCount, 1);
});

test('computeLogStats: overTime is stacked by band and sorted ascending', () => {
  const s = computeLogStats(logSample);
  const totals = s.overTime.reduce(
    (acc, b) => ({
      error: acc.error + b.error,
      warn: acc.warn + b.warn,
      info: acc.info + b.info,
    }),
    { error: 0, warn: 0, info: 0 }
  );
  assert.deepEqual(totals, { error: 1, warn: 1, info: 2 });
  const buckets = s.overTime.map((b) => b.bucket);
  assert.deepEqual([...buckets].sort(), buckets);
});

test('computeLogStats: levelDistribution covers all present levels', () => {
  const s = computeLogStats(logSample);
  const levels = s.levelDistribution.map((d) => d.level).sort();
  assert.deepEqual(levels, ['debug', 'error', 'info', 'warn']);
});
