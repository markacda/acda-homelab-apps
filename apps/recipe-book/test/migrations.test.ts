import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrateEntitySet, runMigrations } from '../Adapters/JsonFileStore/migrations/run-migrations.ts';
import type { EntityMigrationSet, Migration } from '../Adapters/JsonFileStore/migrations/migrations.ts';

// A throwaway data directory holding a single JSON file. Returns the dir path
// and the file path so tests can read the migrated result back.
function withFile(json: unknown): { dir: string; file: string } {
  const dir = mkdtempSync(join(tmpdir(), 'recipe-migrations-'));
  const file = join(dir, 'entity-1.json');
  writeFileSync(file, JSON.stringify(json, null, 2), 'utf8');
  return { dir, file };
}

function readBack(file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
}

test('stamps a legacy (version-less) file as schema v1 without changing its data', () => {
  const { dir, file } = withFile({ id: 'r1', title: 'Soep', ingredients: [], steps: [] });
  try {
    const set: EntityMigrationSet = { name: 'recipes', dir, currentVersion: 1, migrations: [] };
    const changed = migrateEntitySet(set);
    assert.equal(changed, 1);
    const after = readBack(file);
    assert.equal(after.schemaVersion, 1);
    assert.equal(after.title, 'Soep');
    assert.deepEqual(after.ingredients, []);
    // Re-running is idempotent: the file already carries the current version.
    assert.equal(migrateEntitySet(set), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('applies an ordered migration step to transform an old file to the new shape', () => {
  const { dir, file } = withFile({ schemaVersion: 1, id: 'r1', title: 'Taart' });
  try {
    const migrations: Migration[] = [{ from: 1, to: 2, migrate: (r) => ({ ...r, tags: [] }) }];
    const set: EntityMigrationSet = { name: 'recipes', dir, currentVersion: 2, migrations };
    const changed = migrateEntitySet(set);
    assert.equal(changed, 1);
    const after = readBack(file);
    assert.equal(after.schemaVersion, 2);
    assert.equal(after.title, 'Taart');
    assert.deepEqual(after.tags, []);
    // Idempotent on a second run.
    assert.equal(migrateEntitySet(set), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('chains multiple steps in order (v1 -> v2 -> v3)', () => {
  const { dir, file } = withFile({ id: 'r1', value: 1 });
  try {
    const migrations: Migration[] = [
      { from: 1, to: 2, migrate: (r) => ({ ...r, value: (r.value as number) + 1 }) },
      { from: 2, to: 3, migrate: (r) => ({ ...r, value: (r.value as number) * 10 }) },
    ];
    const set: EntityMigrationSet = { name: 'recipes', dir, currentVersion: 3, migrations };
    assert.equal(migrateEntitySet(set), 1);
    const after = readBack(file);
    assert.equal(after.schemaVersion, 3);
    assert.equal(after.value, 20); // (1 + 1) * 10
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('throws when no migration step bridges the stored version to current', () => {
  const { dir } = withFile({ schemaVersion: 1, id: 'r1' });
  try {
    const set: EntityMigrationSet = { name: 'recipes', dir, currentVersion: 2, migrations: [] };
    assert.throws(() => migrateEntitySet(set), /No migration step/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('throws on a file newer than the app understands (refuses to downgrade)', () => {
  const { dir } = withFile({ schemaVersion: 5, id: 'r1' });
  try {
    const set: EntityMigrationSet = { name: 'recipes', dir, currentVersion: 1, migrations: [] };
    assert.throws(() => migrateEntitySet(set), /newer than this app/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('throws loudly on an unparseable file instead of silently skipping it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'recipe-migrations-'));
  try {
    writeFileSync(join(dir, 'broken.json'), '{ not valid json', 'utf8');
    const set: EntityMigrationSet = { name: 'recipes', dir, currentVersion: 1, migrations: [] };
    assert.throws(() => migrateEntitySet(set), /Cannot migrate/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runMigrations tolerates a missing data directory', () => {
  const missing = join(tmpdir(), 'recipe-migrations-does-not-exist-xyz');
  const set: EntityMigrationSet = { name: 'recipes', dir: missing, currentVersion: 1, migrations: [] };
  assert.doesNotThrow(() => runMigrations([set]));
});

test('runMigrations only rewrites files that are behind', () => {
  const dir = mkdtempSync(join(tmpdir(), 'recipe-migrations-'));
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'current.json'), JSON.stringify({ schemaVersion: 1, id: 'a' }), 'utf8');
    writeFileSync(join(dir, 'legacy.json'), JSON.stringify({ id: 'b' }), 'utf8');
    const set: EntityMigrationSet = { name: 'recipes', dir, currentVersion: 1, migrations: [] };
    // Only the legacy (version-less) file is rewritten.
    assert.equal(migrateEntitySet(set), 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
