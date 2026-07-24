import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RunwayConfiguration } from '../Domain/ValueObjects/runway-configuration.ts';

const SAMPLE = {
  id: 1646016,
  updated: '2026-07-24T12:11:02.527Z',
  start: '2026-07-24T10:05:00Z',
  end: '2026-07-24T10:21:00Z',
  landing1: '18R',
  landing2: '',
  landing3: '   ',
  takeoff1: '24',
  takeoff2: '18L',
  takeoff3: '   ',
  state: '',
  isLast: true,
};

test('parses the EHAM runway payload and normalises the runway slots', () => {
  const config = RunwayConfiguration.fromJson(JSON.stringify(SAMPLE));

  assert.equal(config.id, 1646016);
  assert.equal(config.start, '2026-07-24T10:05:00Z');
  assert.equal(config.end, '2026-07-24T10:21:00Z');
  // Blank ("") and whitespace-only ("   ") slots are dropped.
  assert.deepEqual([...config.landing], ['18R']);
  assert.deepEqual([...config.takeoff], ['24', '18L']);
  assert.equal(config.isLast, true);
});

test('accepts an already-parsed object', () => {
  const config = RunwayConfiguration.fromJson(SAMPLE);
  assert.deepEqual([...config.takeoff], ['24', '18L']);
});

test('rejects invalid JSON', () => {
  assert.throws(() => RunwayConfiguration.fromJson('not json'));
});

test('rejects a payload without a numeric id', () => {
  assert.throws(() => RunwayConfiguration.fromJson(JSON.stringify({ landing1: '18R' })));
});
