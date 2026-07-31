import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowToNotification, insertNotification } from '../Adapters/Postgres/postgres-notification-store.ts';

test('rowToNotification maps a timestamptz row and drops null/empty optionals', () => {
  const n = rowToNotification({
    id: 'a',
    created_at: new Date('2026-07-17T00:00:00.000Z'),
    title: 'T',
    message: 'M',
    channels: [],
    url: null,
    icon: null,
    receiver: null,
  });
  assert.equal(n.id, 'a');
  assert.equal(n.createdAt, '2026-07-17T00:00:00.000Z');
  assert.equal(n.channels, undefined);
  assert.equal(n.url, undefined);
});

test('rowToNotification keeps present channels and url', () => {
  const n = rowToNotification({
    id: 'b',
    created_at: '2026-07-17T00:00:00.000Z',
    title: 'T',
    message: 'M',
    channels: ['email'],
    url: '/logs/',
    icon: null,
    receiver: null,
  });
  assert.deepEqual(n.channels, ['email']);
  assert.equal(n.url, '/logs/');
});

test('insertNotification sends the columns in order, nulling absent optionals', async () => {
  let captured: { text: string; params?: unknown[] } | undefined;
  const db = {
    async query(text: string, params?: unknown[]) {
      captured = { text, params };
      return {};
    },
  };
  await insertNotification(db, { id: 'i', createdAt: 'now', title: 'T', message: 'M' });
  assert.match(captured!.text, /INSERT INTO notifications/);
  assert.match(captured!.text, /ON CONFLICT \(id\) DO NOTHING/);
  assert.deepEqual(captured!.params, ['i', 'now', 'T', 'M', null, null, null, null]);
});
