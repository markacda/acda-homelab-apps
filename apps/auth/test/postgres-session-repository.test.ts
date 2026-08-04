import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import { Session } from '../Domain/Aggregates/session.ts';
import { PostgresSessionRepository, rowToSession } from '../Adapters/Postgres/postgres-session-repository.ts';

/** A fake pool that records queries and returns preset rows. */
function fakePool(rows: unknown[] = []): { pool: Pool; queries: { text: string; params?: unknown[] }[] } {
  const queries: { text: string; params?: unknown[] }[] = [];
  const pool = {
    async query(text: string, params?: unknown[]) {
      queries.push({ text, params });
      return { rows };
    },
  } as unknown as Pool;
  return { pool, queries };
}

test('rowToSession maps a sessions row into the aggregate', () => {
  const s = rowToSession({
    id: 's1',
    person_id: 'p1',
    token_hash: 'abc',
    expires_at: new Date('2026-09-01T00:00:00.000Z'),
    created_at: '2026-08-03T00:00:00.000Z',
  });
  assert.equal(s.id, 's1');
  assert.equal(s.personId, 'p1');
  assert.equal(s.tokenHash, 'abc');
  assert.equal(s.expiresAt, '2026-09-01T00:00:00.000Z');
  assert.equal(s.createdAt, '2026-08-03T00:00:00.000Z');
});

test('create inserts a sessions row with the aggregate fields', async () => {
  const { pool, queries } = fakePool();
  const repo = new PostgresSessionRepository(pool);
  const session = Session.fromJSON({
    id: 's1',
    personId: 'p1',
    tokenHash: 'abc',
    expiresAt: '2026-09-01T00:00:00.000Z',
    createdAt: '2026-08-03T00:00:00.000Z',
  });
  await repo.create(session);
  assert.match(queries[0].text, /INSERT INTO sessions/);
  assert.deepEqual(queries[0].params, ['s1', 'p1', 'abc', '2026-09-01T00:00:00.000Z', '2026-08-03T00:00:00.000Z']);
});

test('findByTokenHash returns null when there is no matching row', async () => {
  const { pool, queries } = fakePool([]);
  const repo = new PostgresSessionRepository(pool);
  const found = await repo.findByTokenHash('nope');
  assert.equal(found, null);
  assert.match(queries[0].text, /WHERE token_hash = \$1/);
  assert.deepEqual(queries[0].params, ['nope']);
});

test('findByTokenHash maps a matching row', async () => {
  const { pool } = fakePool([
    { id: 's1', person_id: 'p1', token_hash: 'abc', expires_at: '2026-09-01T00:00:00.000Z', created_at: '2026-08-03T00:00:00.000Z' },
  ]);
  const repo = new PostgresSessionRepository(pool);
  const found = await repo.findByTokenHash('abc');
  assert.equal(found?.id, 's1');
  assert.equal(found?.personId, 'p1');
});

test('consumeByTokenHash deletes-and-returns the matching row atomically', async () => {
  const { pool, queries } = fakePool([
    { id: 's1', person_id: 'p1', token_hash: 'abc', expires_at: '2026-09-01T00:00:00.000Z', created_at: '2026-08-03T00:00:00.000Z' },
  ]);
  const repo = new PostgresSessionRepository(pool);
  const consumed = await repo.consumeByTokenHash('abc');
  assert.equal(consumed?.id, 's1');
  assert.match(queries[0].text, /DELETE FROM sessions WHERE token_hash = \$1/);
  assert.match(queries[0].text, /RETURNING/);
  assert.deepEqual(queries[0].params, ['abc']);
});

test('consumeByTokenHash returns null when no row matches', async () => {
  const { pool } = fakePool([]);
  const repo = new PostgresSessionRepository(pool);
  assert.equal(await repo.consumeByTokenHash('nope'), null);
});

test('deleteByTokenHash and deleteById issue targeted DELETEs', async () => {
  const { pool, queries } = fakePool();
  const repo = new PostgresSessionRepository(pool);
  await repo.deleteByTokenHash('abc');
  await repo.deleteById('s1');
  assert.match(queries[0].text, /DELETE FROM sessions WHERE token_hash = \$1/);
  assert.deepEqual(queries[0].params, ['abc']);
  assert.match(queries[1].text, /DELETE FROM sessions WHERE id = \$1/);
  assert.deepEqual(queries[1].params, ['s1']);
});
