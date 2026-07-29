import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EntityMigrationSet } from './migrations.ts';
import { defaultMigrationSets } from './migrations.ts';

// The startup migration runner. Synchronous by design: every stored file is
// upgraded to the current schema version before any repository serves a read,
// so it must complete before the app handles traffic. Unlike the tolerant
// json-file.ts helpers (which swallow errors and return null), the runner fails
// loudly — a partial or unreadable file must not silently vanish from listings.
//
// Migrations are applied atomically: every file is read, validated and migrated
// in memory first (the "plan" phase), so any parse/validation error throws
// before a single byte is written and the server refuses to start. Only once the
// whole plan is known do we write; if a write then fails, the files already
// rewritten are restored from their originals. Either the whole data set moves
// forward or none of it does.

const VERSION_KEY = 'schemaVersion';

/** One pending file rewrite, carrying the original bytes for rollback. */
interface PlannedWrite {
  path: string;
  original: string;
  content: string;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * The stored schema version. A file without the key is a pre-migrations file
 * and is treated as the baseline v1. A key that is present but not a positive
 * integer is corruption/tampering — throw rather than silently assume v1 and
 * risk applying the wrong migrations.
 */
function readVersion(raw: Record<string, unknown>, name: string, file: string): number {
  if (!(VERSION_KEY in raw)) return 1;
  const v = raw[VERSION_KEY];
  if (typeof v === 'number' && Number.isInteger(v) && v >= 1) return v;
  throw new Error(`${name} file "${file}" has an invalid ${VERSION_KEY} (${JSON.stringify(v)}); expected a positive integer.`);
}

function stripVersion(raw: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...raw };
  delete rest[VERSION_KEY];
  return rest;
}

/**
 * Read, validate and migrate every JSON file in one entity directory to the
 * set's current schema version, returning the rewrites that need to happen
 * (without touching disk). A file without a `schemaVersion` is treated as
 * version 1 (the baseline shape) and stamped. Throws on an unreadable/
 * unparseable file, an invalid version, a missing/non-advancing migration step,
 * or a file newer than the app understands.
 */
function planEntitySet(set: EntityMigrationSet): PlannedWrite[] {
  if (!existsSync(set.dir)) return [];
  const planned: PlannedWrite[] = [];
  for (const file of readdirSync(set.dir)) {
    if (!file.endsWith('.json')) continue;
    const path = join(set.dir, file);

    let original: string;
    let raw: Record<string, unknown>;
    try {
      original = readFileSync(path, 'utf8');
      raw = JSON.parse(original) as Record<string, unknown>;
    } catch (err) {
      throw new Error(`Cannot migrate ${set.name} file "${file}": ${describe(err)}`);
    }

    const from = readVersion(raw, set.name, file);
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
      if (step.to <= version) {
        throw new Error(`Invalid migration step for ${set.name}: from v${step.from} to v${step.to} does not advance the schema version.`);
      }
      data = step.migrate(data);
      version = step.to;
    }

    // Rewrite when the on-disk version differs from current — covers both
    // applied steps and legacy files that lacked the version marker. Stamp the
    // version key LAST so a migration function can never override it.
    if (raw[VERSION_KEY] !== set.currentVersion) {
      const content = JSON.stringify({ ...data, [VERSION_KEY]: set.currentVersion }, null, 2);
      planned.push({ path, original, content });
    }
  }
  return planned;
}

/**
 * Apply a set of planned rewrites. If any write fails, restore every file
 * already written from its captured original so the data set is never left
 * partially migrated, then rethrow.
 */
function applyPlan(planned: PlannedWrite[]): void {
  const written: PlannedWrite[] = [];
  try {
    for (const w of planned) {
      writeFileSync(w.path, w.content, 'utf8');
      written.push(w);
    }
  } catch (err) {
    for (const w of written.reverse()) {
      try {
        writeFileSync(w.path, w.original, 'utf8');
      } catch {
        // Best-effort rollback; surface the original failure below regardless.
      }
    }
    throw new Error(`Migration aborted and rolled back after a write failure: ${describe(err)}`);
  }
}

/**
 * Upgrade every JSON file in one entity directory to the set's current schema
 * version. Returns the number of files rewritten. Atomic: nothing is written
 * unless every file in the directory plans successfully.
 */
export function migrateEntitySet(set: EntityMigrationSet): number {
  const planned = planEntitySet(set);
  applyPlan(planned);
  return planned.length;
}

/**
 * Run all pending data migrations at startup, before repositories serve reads.
 * Call from the composition root (register) ahead of wiring the repositories.
 * Plans every set first so a single bad file anywhere aborts the whole run
 * before any file is written.
 */
export function runMigrations(sets: EntityMigrationSet[] = defaultMigrationSets()): void {
  const plans = sets.map((set) => ({ set, planned: planEntitySet(set) }));
  applyPlan(plans.flatMap((p) => p.planned));
  for (const { set, planned } of plans) {
    if (planned.length > 0) {
      console.log(`[migrations] ${set.name}: upgraded ${planned.length} file(s) to schema v${set.currentVersion}.`);
    }
  }
}
