import { RECIPES_DIR, BOOKS_DIR, CATEGORIES_DIR } from '../paths.ts';

// Data migrations for the on-disk JSON store, in the spirit of Entity Framework
// migrations: every stored file carries a `schemaVersion` envelope key, and an
// ordered list of forward steps per entity type upgrades old files to the
// current shape at startup (see run-migrations.ts). The current on-disk shape is
// the baseline, version 1 — a file with no `schemaVersion` is treated as v1.

/**
 * A single forward migration step for one entity type: transform the parsed
 * JSON of schema version `from` into version `to`. Steps are pure and receive
 * the plain entity object *without* the `schemaVersion` envelope (the runner
 * strips it before and stamps the current version after).
 */
export type MigrateFn = (json: Record<string, unknown>) => Record<string, unknown>;

export interface Migration {
  readonly from: number;
  readonly to: number;
  readonly migrate: MigrateFn;
}

/** The ordered migration set for one entity type (one directory of JSON files). */
export interface EntityMigrationSet {
  readonly name: string;
  readonly dir: string;
  readonly currentVersion: number;
  readonly migrations: readonly Migration[];
}

// Ordered migration steps per entity type. Append a step whenever an aggregate's
// persisted shape changes; the current version derives from the highest `to`.
//
// Example — when Recipe gains a `tags: string[]` field, add:
//   export const recipeMigrations: readonly Migration[] = [
//     { from: 1, to: 2, migrate: (r) => ({ ...r, tags: [] }) },
//   ];
export const recipeMigrations: readonly Migration[] = [];
export const bookMigrations: readonly Migration[] = [];
export const categoryMigrations: readonly Migration[] = [];

/** The current schema version for an entity = the highest step `to` (1 if none). */
export function currentVersionOf(migrations: readonly Migration[]): number {
  return migrations.reduce((v, m) => Math.max(v, m.to), 1);
}

/** Current on-disk schema version per entity type, stamped by the repositories on save. */
export const CURRENT_VERSIONS = {
  recipes: currentVersionOf(recipeMigrations),
  books: currentVersionOf(bookMigrations),
  categories: currentVersionOf(categoryMigrations),
} as const;

/** Build the migration sets for the three real data directories. */
export function defaultMigrationSets(): EntityMigrationSet[] {
  return [
    {
      name: 'recipes',
      dir: RECIPES_DIR,
      currentVersion: CURRENT_VERSIONS.recipes,
      migrations: recipeMigrations,
    },
    { name: 'books', dir: BOOKS_DIR, currentVersion: CURRENT_VERSIONS.books, migrations: bookMigrations },
    {
      name: 'categories',
      dir: CATEGORIES_DIR,
      currentVersion: CURRENT_VERSIONS.categories,
      migrations: categoryMigrations,
    },
  ];
}
