import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runMigrations } from '../migrator.ts';
import type { MigrationClient, MigrationPool } from '../migrator.ts';

// A stub client that records the first line of every query and tracks which
// migration ids have been recorded in `schema_migrations`.
class FakeClient implements MigrationClient {
  readonly calls: string[] = [];
  readonly applied: Set<string>;
  released = false;

  constructor(applied: string[] = []) {
    this.applied = new Set(applied);
  }

  async query(text: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }> {
    this.calls.push(text.trim().split('\n')[0]);
    if (/SELECT id FROM/.test(text)) {
      return { rows: [...this.applied].map((id) => ({ id })), rowCount: this.applied.size };
    }
    if (/INSERT INTO .*schema_migrations/.test(text)) {
      this.applied.add(String((params ?? [])[0]));
    }
    return { rows: [], rowCount: 0 };
  }

  release(): void {
    this.released = true;
  }
}

class FakePool implements MigrationPool {
  readonly client: FakeClient;
  constructor(client: FakeClient) {
    this.client = client;
  }
  async connect(): Promise<MigrationClient> {
    return this.client;
  }
}

function migrationsDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'mig-'));
  for (const [name, sql] of Object.entries(files)) writeFileSync(join(dir, name), sql);
  return dir;
}

test('applies all pending migrations in filename order and records them', async () => {
  const dir = migrationsDir({ '002_b.sql': 'SELECT 2;', '001_a.sql': 'SELECT 1;', 'notes.txt': 'ignored' });
  const client = new FakeClient();
  try {
    const applied = await runMigrations(new FakePool(client), { schema: 'notification', dir });
    assert.deepEqual(applied, ['001_a.sql', '002_b.sql']);
    assert.ok(client.released, 'client is released');
    // Each migration is wrapped in BEGIN/COMMIT.
    assert.equal(client.calls.filter((c) => c === 'BEGIN').length, 2);
    assert.equal(client.calls.filter((c) => c === 'COMMIT').length, 2);
    assert.equal(client.calls.filter((c) => c === 'ROLLBACK').length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('skips migrations already recorded, applies only the new ones', async () => {
  const dir = migrationsDir({ '001_a.sql': 'SELECT 1;', '002_b.sql': 'SELECT 2;' });
  const client = new FakeClient(['001_a.sql']);
  try {
    const applied = await runMigrations(new FakePool(client), { schema: 'notification', dir });
    assert.deepEqual(applied, ['002_b.sql']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a re-run against a fully-applied schema is a no-op', async () => {
  const dir = migrationsDir({ '001_a.sql': 'SELECT 1;' });
  const client = new FakeClient(['001_a.sql']);
  try {
    const applied = await runMigrations(new FakePool(client), { schema: 'recipe_book', dir });
    assert.deepEqual(applied, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rejects an unsafe schema identifier before touching the db', async () => {
  const client = new FakeClient();
  await assert.rejects(() => runMigrations(new FakePool(client), { schema: 'bad; DROP TABLE x', dir: '/nonexistent' }), /Unsafe SQL identifier/);
  assert.equal(client.calls.length, 0);
});
