import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EntityMigrationSet } from './migrations.ts';
import { defaultMigrationSets } from './migrations.ts';

// The startup migration runner. Synchronous by design: every stored file is
// upgraded to the current schema version before any repository serves a read,
// so it must complete before the app handles traffic. Unlike the tolerant
// json-file.ts helpers (which swallow errors and return null), the runner fails
// loudly — a partial or unreadable file must not silently vanish from listings.

const VERSION_KEY = 'schemaVersion';

function readVersion(raw: Record<string, unknown>): number {
  const v = raw[VERSION_KEY];
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 ? v : 1;
}

function stripVersion(raw: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...raw };
  delete rest[VERSION_KEY];
  return rest;
}

/**
 * Upgrade every JSON file in one entity directory to the set's current schema
 * version, applying the ordered migration steps in turn. A file without a
 * `schemaVersion` is treated as version 1 (the baseline shape) and stamped.
 * Returns the number of files rewritten. Throws on an unreadable/unparseable
 * file, a missing migration step, or a file newer than the app understands.
 */
export function migrateEntitySet(set: EntityMigrationSet): number {
  if (!existsSync(set.dir)) return 0;
  let changed = 0;
  for (const file of readdirSync(set.dir)) {
    if (!file.endsWith('.json')) continue;
    const path = join(set.dir, file);

    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    } catch (err) {
      throw new Error(`Cannot migrate ${set.name} file "${file}": ${err instanceof Error ? err.message : String(err)}`);
    }

    const from = readVersion(raw);
    if (from > set.currentVersion) {
      throw new Error(`${set.name} file "${file}" is schema v${from}, newer than this app's v${set.currentVersion} — refusing to downgrade.`);
    }

    let data = stripVersion(raw);
    let version = from;
    while (version < set.currentVersion) {
      const step = set.migrations.find((m) => m.from === version);
      if (!step) {
        throw new Error(`No migration step for ${set.name} from schema v${version} toward v${set.currentVersion}.`);
      }
      data = step.migrate(data);
      version = step.to;
    }

    // Rewrite when the on-disk version differs from current — covers both
    // applied steps and legacy files that lacked the version marker.
    if (raw[VERSION_KEY] !== set.currentVersion) {
      writeFileSync(path, JSON.stringify({ [VERSION_KEY]: set.currentVersion, ...data }, null, 2), 'utf8');
      changed += 1;
    }
  }
  return changed;
}

/**
 * Run all pending data migrations at startup, before repositories serve reads.
 * Call from the composition root (register) ahead of wiring the repositories.
 */
export function runMigrations(sets: EntityMigrationSet[] = defaultMigrationSets()): void {
  for (const set of sets) {
    const changed = migrateEntitySet(set);
    if (changed > 0) {
      console.log(`[migrations] ${set.name}: upgraded ${changed} file(s) to schema v${set.currentVersion}.`);
    }
  }
}
