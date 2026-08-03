import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectTrace } from '../Domain/Services/log-analytics.ts';
import type { AccessLogEntry, AppLogEntry, ExceptionLogEntry, DependencyLogEntry } from '../Domain/ValueObjects/log-entry.ts';

function req(over: Partial<AccessLogEntry>): AccessLogEntry {
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

function log(over: Partial<AppLogEntry>): AppLogEntry {
  return { ts: '2026-07-06T10:00:00.000Z', app: 'atc', level: 'info', message: 'hi', params: [], ...over };
}

function exc(over: Partial<ExceptionLogEntry>): ExceptionLogEntry {
  return { ts: '2026-07-06T10:00:00.000Z', app: 'atc', kind: 'exception', name: 'Error', message: 'boom', source: 'express', ...over };
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

// The request (T=00) drives a log (01), a dependency (02) and an exception (03),
// all sharing trace "t1". A second trace "t2" and some trace-less records are noise.
const sources = {
  requests: [
    req({ traceId: 't1', ts: '2026-07-06T10:00:00Z' }),
    req({ traceId: 't2', ts: '2026-07-06T10:05:00Z' }),
    req({ ts: '2026-07-06T10:06:00Z' }),
  ],
  logs: [log({ traceId: 't1', ts: '2026-07-06T10:01:00Z', message: 'first' }), log({ ts: '2026-07-06T10:01:30Z', message: 'orphan' })],
  exceptions: [exc({ traceId: 't1', ts: '2026-07-06T10:03:00Z' }), exc({ traceId: 't2', ts: '2026-07-06T10:05:30Z' })],
  dependencies: [dep({ traceId: 't1', ts: '2026-07-06T10:02:00Z' })],
};

test('collectTrace: gathers all four kinds for a matching trace id', () => {
  const items = collectTrace('t1', sources);
  assert.equal(items.length, 4);
  assert.deepEqual(
    items.map((i) => i.kind),
    ['request', 'log', 'dependency', 'exception']
  );
});

test('collectTrace: orders items by timestamp ascending', () => {
  const items = collectTrace('t1', sources);
  const times = items.map((i) => i.entry.ts);
  assert.deepEqual(times, [...times].sort());
  assert.equal(items[0].kind, 'request'); // T=00 comes first
  assert.equal(items[3].kind, 'exception'); // T=03 comes last
});

test('collectTrace: tags each item with the correct kind and entry', () => {
  const items = collectTrace('t1', sources);
  const log0 = items.find((i) => i.kind === 'log');
  assert.ok(log0);
  assert.equal(log0.kind === 'log' && log0.entry.message, 'first');
});

test('collectTrace: excludes non-matching and trace-less records', () => {
  const items = collectTrace('t1', sources);
  assert.ok(items.every((i) => i.entry.traceId === 't1'));
  // t2 has 1 request + 1 exception; a request and a log carry no traceId at all.
  assert.equal(collectTrace('t2', sources).length, 2);
});

test('collectTrace: unknown trace id yields an empty timeline', () => {
  assert.deepEqual(collectTrace('nope', sources), []);
});
