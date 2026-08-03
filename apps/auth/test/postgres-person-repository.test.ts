import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import { Person } from '../Domain/Aggregates/person.ts';
import { PostgresPersonRepository, rowToPerson } from '../Adapters/Postgres/postgres-person-repository.ts';

test('rowToPerson maps a joined persons row into the aggregate', () => {
  const p = rowToPerson({
    id: 'p1',
    email: 'alice@example.com',
    password_hash: 'hash',
    created_at: new Date('2026-08-03T00:00:00.000Z'),
    roles: ['User', 'Administrator'],
  });
  assert.equal(p.id, 'p1');
  assert.equal(p.email, 'alice@example.com');
  assert.equal(p.passwordHash, 'hash');
  assert.deepEqual(p.roles, ['User', 'Administrator']);
  assert.equal(p.createdAt, '2026-08-03T00:00:00.000Z');
});

test('rowToPerson defaults a null roles column to an empty set', () => {
  const p = rowToPerson({
    id: 'p2',
    email: 'bob@example.com',
    password_hash: 'h',
    created_at: '2026-08-03T00:00:00.000Z',
    roles: null,
  });
  assert.deepEqual(p.roles, []);
});

test('save upserts the person then replaces its role set in one transaction', async () => {
  const queries: { text: string; params?: unknown[] }[] = [];
  const client = {
    async query(text: string, params?: unknown[]) {
      queries.push({ text, params });
      return { rows: [] };
    },
    release() {},
  };
  const pool = {
    async connect() {
      return client;
    },
  } as unknown as Pool;

  const repo = new PostgresPersonRepository(pool);
  const person = Person.fromJSON({
    id: 'p1',
    email: 'alice@example.com',
    passwordHash: 'hash',
    roles: ['User', 'Administrator'],
    createdAt: '2026-08-03T00:00:00.000Z',
  });
  await repo.save(person);

  const texts = queries.map((q) => q.text);
  assert.equal(texts[0], 'BEGIN');
  assert.match(texts[1], /INSERT INTO persons/);
  assert.match(texts[1], /ON CONFLICT \(id\) DO UPDATE/);
  assert.match(texts[2], /DELETE FROM person_roles WHERE person_id = \$1/);
  assert.match(texts[3], /INSERT INTO person_roles/);
  assert.match(texts[4], /INSERT INTO person_roles/);
  assert.equal(texts[texts.length - 1], 'COMMIT');
  assert.deepEqual(queries[1].params, ['p1', 'alice@example.com', 'hash', '2026-08-03T00:00:00.000Z']);
  assert.deepEqual(queries[3].params, ['p1', 'User']);
  assert.deepEqual(queries[4].params, ['p1', 'Administrator']);
});
