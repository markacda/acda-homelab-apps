import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAlertRules, type AlertRuleConfig, type AlertInputs } from '../Domain/Services/alert-rules.ts';

const NOW = Date.parse('2026-07-06T10:05:00.000Z');

function req(status: number, durationMs: number, ts: string): AlertInputs['requests'][number] {
  return { status, durationMs, ts };
}

function cfg(over: Partial<AlertRuleConfig> = {}): AlertRuleConfig {
  return { windowMs: 5 * 60 * 1000, errorBurst: 3, errorRate: 0.5, slowP95Ms: 1000, exceptionBurst: 2, minSample: 4, ...over };
}

function keys(inputs: Partial<AlertInputs>, config: AlertRuleConfig = cfg()): string[] {
  return evaluateAlertRules({ requests: inputs.requests ?? [], exceptions: inputs.exceptions ?? [] }, config, NOW)
    .map((a) => a.key)
    .sort();
}

test('errorBurst fires at/above the 5xx threshold in the window', () => {
  const requests = [req(500, 10, '2026-07-06T10:02:00Z'), req(500, 10, '2026-07-06T10:03:00Z'), req(500, 10, '2026-07-06T10:04:00Z')];
  assert.deepEqual(keys({ requests }), ['errorBurst']);
});

test('errorBurst ignores 5xx older than the window and stays below threshold', () => {
  const requests = [
    req(500, 10, '2026-07-06T09:58:00Z'), // before now - 5min → excluded
    req(500, 10, '2026-07-06T10:03:00Z'),
    req(500, 10, '2026-07-06T10:04:00Z'),
  ];
  assert.deepEqual(keys({ requests }), []); // only 2 in window
});

test('errorRate fires when the failed fraction exceeds the threshold', () => {
  const requests = [
    req(404, 10, '2026-07-06T10:01:00Z'),
    req(404, 10, '2026-07-06T10:02:00Z'),
    req(404, 10, '2026-07-06T10:03:00Z'),
    req(200, 10, '2026-07-06T10:04:00Z'),
  ];
  assert.deepEqual(keys({ requests }), ['errorRate']); // 3/4 = 75% > 50%
});

test('errorRate is gated by minSample', () => {
  const requests = [req(404, 10, '2026-07-06T10:02:00Z'), req(404, 10, '2026-07-06T10:03:00Z'), req(404, 10, '2026-07-06T10:04:00Z')];
  assert.deepEqual(keys({ requests }), []); // 100% failure but only 3 < minSample 4
});

test('slowP95 fires when the p95 duration exceeds the threshold', () => {
  const requests = [
    req(200, 100, '2026-07-06T10:00:30Z'),
    req(200, 100, '2026-07-06T10:01:00Z'),
    req(200, 100, '2026-07-06T10:02:00Z'),
    req(200, 100, '2026-07-06T10:03:00Z'),
    req(200, 5000, '2026-07-06T10:04:00Z'),
  ];
  assert.deepEqual(keys({ requests }), ['slowP95']); // p95 = 5000 > 1000
});

test('exceptionBurst fires at/above the exception threshold in the window', () => {
  const exceptions = [{ ts: '2026-07-06T10:03:00Z' }, { ts: '2026-07-06T10:04:00Z' }];
  assert.deepEqual(keys({ exceptions }), ['exceptionBurst']);
});

test('rules with a 0 threshold are disabled', () => {
  const requests = [
    req(500, 9000, '2026-07-06T10:02:00Z'),
    req(500, 9000, '2026-07-06T10:03:00Z'),
    req(500, 9000, '2026-07-06T10:04:00Z'),
    req(500, 9000, '2026-07-06T10:04:30Z'),
  ];
  const exceptions = [{ ts: '2026-07-06T10:03:00Z' }, { ts: '2026-07-06T10:04:00Z' }];
  const disabled = cfg({ errorBurst: 0, errorRate: 0, slowP95Ms: 0, exceptionBurst: 0 });
  assert.deepEqual(keys({ requests, exceptions }, disabled), []);
});
