import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Pool } from 'pg';
import { rowToNotification, insertNotification } from '../Adapters/Postgres/postgres-notification-store.ts';
import { importLegacyNotifications } from '../Adapters/Postgres/notification-import.ts';
import type { Notification } from '../Domain/ValueObjects/notification.ts';

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

test('importLegacyNotifications is a no-op when the table already has rows', async () => {
  const pool = {
    async query(text: string) {
      if (/count\(\*\)/.test(text)) return { rows: [{ count: '5' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    async connect() {
      throw new Error('should not connect when the table is non-empty');
    },
  } as unknown as Pool;
  const n = await importLegacyNotifications(pool, '/does/not/matter.json');
  assert.equal(n, 0);
});

test('importLegacyNotifications is a no-op when the JSON file is absent', async () => {
  const pool = {
    async query(text: string) {
      if (/count\(\*\)/.test(text)) return { rows: [{ count: '0' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    async connect() {
      throw new Error('should not connect when there is nothing to import');
    },
  } as unknown as Pool;
  const n = await importLegacyNotifications(pool, join(tmpdir(), 'definitely-missing-notifications.json'));
  assert.equal(n, 0);
});

test('importLegacyNotifications imports a newest-first file oldest-first', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'notif-'));
  const file = join(dir, 'notifications.json');
  // Stored newest-first (as the file store wrote them).
  const feed: Notification[] = [
    { id: 'new', createdAt: '2026-07-18T00:00:00Z', title: 'newest', message: 'M' },
    { id: 'old', createdAt: '2026-07-17T00:00:00Z', title: 'oldest', message: 'M' },
  ];
  writeFileSync(file, JSON.stringify(feed));

  const inserted: Notification[] = [];
  const client = {
    async query(text: string, params?: unknown[]) {
      if (/INSERT INTO notifications/.test(text)) {
        const p = params ?? [];
        inserted.push({ id: String(p[0]), createdAt: String(p[1]), title: String(p[2]), message: String(p[3]) });
      }
      return {};
    },
    release() {},
  };
  const pool = {
    async query(text: string) {
      if (/count\(\*\)/.test(text)) return { rows: [{ count: '0' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    async connect() {
      return client;
    },
  } as unknown as Pool;

  try {
    const n = await importLegacyNotifications(pool, file);
    assert.equal(n, 2);
    // Inserted oldest-first so the identity seq ends up chronological.
    assert.deepEqual(
      inserted.map((x) => x.id),
      ['old', 'new']
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
