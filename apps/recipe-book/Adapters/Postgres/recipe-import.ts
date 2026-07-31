import { join } from 'node:path';
import type { Pool } from 'pg';
import { RECIPES_DIR, BOOKS_DIR, CATEGORIES_DIR } from '../JsonFileStore/paths.ts';
import { readJson, listIds } from '../JsonFileStore/json-file.ts';
import { countRows, upsertJson } from './jsonb-store.ts';
import type { StorableData } from './jsonb-store.ts';

// One-time, idempotent import of the legacy JSON-file store into Postgres. Runs
// at startup after migrations. Per table: a no-op if the table already has rows
// or the legacy directory is empty/absent, so it is safe to leave in and re-run.
// Removable once every deployment has cut over (see docs/database-migration.md).
//
// Only structured data moves; image files stay under DATA_DIR/images and are
// still served from there. The stored files carry a `schemaVersion` envelope key
// (currently always 1) which is stripped before storing.

/** Import one entity directory into its table if the table is empty. Returns rows imported. */
async function importDir(pool: Pool, table: string, dir: string): Promise<number> {
  if ((await countRows(pool, table)) > 0) return 0;

  const ids = await listIds(dir);
  let imported = 0;
  for (const id of ids) {
    const raw = await readJson<StorableData & { schemaVersion?: number }>(join(dir, `${id}.json`));
    if (!raw) continue;
    // Drop the on-disk schemaVersion envelope key before storing.
    const data: StorableData & { schemaVersion?: number } = { ...raw };
    delete data.schemaVersion;
    await upsertJson(pool, table, data);
    imported++;
  }
  if (imported > 0) console.log(`[import] ${table}: imported ${imported} row(s) from ${dir}`);
  return imported;
}

/** Import recipes, books and categories from the JSON-file store into Postgres. */
export async function importLegacyRecipeData(pool: Pool): Promise<void> {
  await importDir(pool, 'recipes', RECIPES_DIR);
  await importDir(pool, 'books', BOOKS_DIR);
  await importDir(pool, 'categories', CATEGORIES_DIR);
}
