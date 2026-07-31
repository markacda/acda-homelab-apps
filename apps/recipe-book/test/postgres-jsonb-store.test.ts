import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import { listJson, getJson, upsertJson, deleteJson, countRows } from '../Adapters/Postgres/jsonb-store.ts';

function recordingPool(rows: unknown[] = []) {
  const calls: { text: string; params?: unknown[] }[] = [];
  const pool = {
    async query(text: string, params?: unknown[]) {
      calls.push({ text, params });
      return { rows, rowCount: rows.length };
    },
  } as unknown as Pool;
  return { pool, calls };
}

test('listJson selects newest-first and returns the data payloads', async () => {
  const { pool, calls } = recordingPool([{ data: { id: '1' } }, { data: { id: '2' } }]);
  const out = await listJson<{ id: string }>(pool, 'recipes');
  assert.deepEqual(out, [{ id: '1' }, { id: '2' }]);
  assert.match(calls[0].text, /ORDER BY updated_at DESC/);
  assert.match(calls[0].text, /FROM "recipes"/);
});

test('getJson returns the row data or null', async () => {
  const hit = recordingPool([{ data: { id: 'x' } }]);
  assert.deepEqual(await getJson(hit.pool, 'books', 'x'), { id: 'x' });
  const miss = recordingPool([]);
  assert.equal(await getJson(miss.pool, 'books', 'y'), null);
});

test('upsertJson sends id/data/updatedAt and upserts on conflict', async () => {
  const { pool, calls } = recordingPool();
  const data = { id: 'r1', updatedAt: '2026-07-17T00:00:00Z', title: 'Soup' };
  await upsertJson(pool, 'recipes', data);
  assert.match(calls[0].text, /INSERT INTO "recipes"/);
  assert.match(calls[0].text, /ON CONFLICT \(id\) DO UPDATE/);
  assert.deepEqual(calls[0].params, ['r1', data, '2026-07-17T00:00:00Z']);
});

test('deleteJson deletes by id', async () => {
  const { pool, calls } = recordingPool();
  await deleteJson(pool, 'categories', 'c1');
  assert.match(calls[0].text, /DELETE FROM "categories"/);
  assert.deepEqual(calls[0].params, ['c1']);
});

test('countRows parses the text count', async () => {
  const { pool } = recordingPool([{ count: '7' }]);
  assert.equal(await countRows(pool, 'recipes'), 7);
});

test('an unsafe table name is rejected before any query', async () => {
  const { pool, calls } = recordingPool();
  await assert.rejects(() => getJson(pool, 'recipes; DROP TABLE x', 'id'), /Unsafe table name/);
  assert.equal(calls.length, 0);
});
