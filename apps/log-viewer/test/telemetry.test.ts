import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAll } from '../Adapters/FileLogStore/parse.ts';
import { filterExceptions, computeExceptionStats, filterDependencies, computeDependencyStats } from '../Domain/Services/log-analytics.ts';
import type { ExceptionLogEntry, DependencyLogEntry } from '../Domain/ValueObjects/log-entry.ts';

function exc(over: Partial<ExceptionLogEntry>): ExceptionLogEntry {
  return {
    ts: '2026-07-06T10:00:00.000Z',
    app: 'atc',
    kind: 'exception',
    name: 'Error',
    message: 'boom',
    source: 'express',
    ...over,
  };
}

function dep(over: Partial<DependencyLogEntry>): DependencyLogEntry {
  return {
    ts: '2026-07-06T10:00:00.000Z',
    app: 'atc',
    kind: 'dependency',
    type: 'http',
    target: 'a.com',
    name: 'GET /',
    durationMs: 10,
    success: true,
    ...over,
  };
}

// ---- parse: 4-way classification ------------------------------------------

test('parseAll classifies all four record kinds by kind/shape', () => {
  const text = [
    JSON.stringify({ ts: '2026-07-06T10:00:00Z', app: 'a', status: 200, durationMs: 1 }), // request
    JSON.stringify({ ts: '2026-07-06T10:00:00Z', app: 'a', level: 'info', message: 'hi' }), // app-log
    JSON.stringify(exc({})), // exception
    JSON.stringify(dep({})), // dependency
    '', // blank
    '{not json', // malformed
    JSON.stringify({ ts: 'x' }), // no discriminator/shape
  ].join('\n');
  const { requests, logs, exceptions, dependencies } = parseAll(text);
  assert.equal(requests.length, 1);
  assert.equal(logs.length, 1);
  assert.equal(exceptions.length, 1);
  assert.equal(dependencies.length, 1);
  assert.equal(exceptions[0].kind, 'exception');
  assert.equal(dependencies[0].kind, 'dependency');
});

// ---- exceptions -----------------------------------------------------------

const excSample: ExceptionLogEntry[] = [
  exc({ app: 'atc', name: 'TypeError', message: 'boom', source: 'express', ts: '2026-07-06T10:00:00Z' }),
  exc({ app: 'atc', name: 'TypeError', message: 'boom', source: 'express', ts: '2026-07-06T10:01:00Z' }),
  exc({ app: 'ev', name: 'Error', message: 'nope', source: 'uncaught', ts: '2026-07-06T10:02:00Z' }),
];

test('filterExceptions: by app / source / q', () => {
  assert.equal(filterExceptions(excSample, { app: ['atc'] }).length, 2);
  assert.equal(filterExceptions(excSample, { source: ['uncaught'] }).length, 1);
  assert.equal(filterExceptions(excSample, { q: 'BOOM' }).length, 2); // matches message, case-insensitive
});

test('computeExceptionStats: groups distinct problems by name+message', () => {
  const s = computeExceptionStats(excSample);
  assert.equal(s.overall.count, 3);
  assert.equal(s.overall.problemCount, 2);
  assert.equal(s.overall.appCount, 2);
  const top = s.problems[0];
  assert.equal(top.name, 'TypeError');
  assert.equal(top.message, 'boom');
  assert.equal(top.count, 2);
  assert.equal(top.lastSeen, '2026-07-06T10:01:00Z');
  assert.deepEqual(top.apps, ['atc']);
});

test('computeExceptionStats: bySource, perApp and overTime totals', () => {
  const s = computeExceptionStats(excSample);
  assert.deepEqual(
    s.bySource.map((b) => [b.source, b.count]),
    [
      ['express', 2],
      ['uncaught', 1],
    ]
  );
  assert.equal(s.perApp.find((a) => a.app === 'atc')!.count, 2);
  assert.equal(
    s.overTime.reduce((n, b) => n + b.count, 0),
    3
  );
});

// ---- dependencies ---------------------------------------------------------

const depSample: DependencyLogEntry[] = [
  dep({ type: 'http', target: 'a.com', name: 'GET /1', durationMs: 100, success: true, ts: '2026-07-06T10:00:00Z' }),
  dep({ type: 'http', target: 'a.com', name: 'GET /2', durationMs: 200, success: false, error: 'x', ts: '2026-07-06T10:01:00Z' }),
  dep({ type: 'http', target: 'a.com', name: 'GET /3', durationMs: 300, success: true, ts: '2026-07-06T10:02:00Z' }),
  dep({ type: 'postgres', target: 'db', name: 'SELECT', durationMs: 5, success: true, ts: '2026-07-06T10:03:00Z' }),
];

test('filterDependencies: by type / target / outcome / q', () => {
  assert.equal(filterDependencies(depSample, { type: ['postgres'] }).length, 1);
  assert.equal(filterDependencies(depSample, { target: ['a.com'] }).length, 3);
  assert.equal(filterDependencies(depSample, { outcome: 'failure' }).length, 1);
  assert.equal(filterDependencies(depSample, { outcome: 'success' }).length, 3);
  assert.equal(filterDependencies(depSample, { q: 'select' }).length, 1); // matches name
});

test('computeDependencyStats: overall count, failure rate, avg and p95', () => {
  const s = computeDependencyStats(depSample);
  assert.equal(s.overall.count, 4);
  assert.equal(s.overall.failureCount, 1);
  assert.equal(s.overall.failureRate, 0.25);
  assert.equal(s.overall.avgDurationMs, 151.25); // (100+200+300+5)/4
  assert.equal(s.overall.p95DurationMs, 300); // nearest-rank over [5,100,200,300]
});

test('computeDependencyStats: perTarget, slowest (min 3 calls) and overTime bands', () => {
  const s = computeDependencyStats(depSample);
  const aCom = s.perTarget.find((t) => t.target === 'a.com')!;
  assert.equal(aCom.count, 3);
  assert.equal(aCom.failureCount, 1);
  assert.equal(aCom.avgDurationMs, 200); // (100+200+300)/3
  // Only a.com has ≥3 calls; the db target (1 call) is excluded from "slowest".
  assert.deepEqual(
    s.slowest.map((t) => t.target),
    ['a.com']
  );
  const totals = s.overTime.reduce((acc, b) => ({ ok: acc.ok + b.ok, failed: acc.failed + b.failed }), { ok: 0, failed: 0 });
  assert.deepEqual(totals, { ok: 3, failed: 1 });
});
