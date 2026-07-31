import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// A tiny SQL-file migration runner, in the spirit of recipe-book's on-disk
// JSON migration runner: idempotent and fail-loud. Each app ships an ordered set
// of `*.sql` files; on startup we apply the ones not yet recorded, each inside
// its own transaction, and record it in a per-schema `schema_migrations` table.
// Re-running is a no-op. A bad migration aborts (rolled back) and the app
// refuses to start rather than serving against a half-migrated schema.

/** Minimal pg client surface, so the runner can be unit-tested with a stub. */
export interface MigrationClient {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }>;
  release(): void;
}

/** Minimal pg.Pool surface (only what the runner needs). pg.Pool satisfies it. */
export interface MigrationPool {
  connect(): Promise<MigrationClient>;
}

export interface MigrationOptions {
  /** The schema the migrations (and the bookkeeping table) live in. */
  readonly schema: string;
  /** Directory holding the ordered `*.sql` migration files. */
  readonly dir: string;
}

/** Schema/identifier guard — these are code-owned constants, never user input. */
function assertIdentifier(id: string): void {
  if (!/^[a-z_][a-z0-9_]*$/.test(id)) {
    throw new Error(`Unsafe SQL identifier: ${JSON.stringify(id)}`);
  }
}

/** The `*.sql` migration ids in a directory, sorted lexically (so 001, 002, …). */
function listMigrationFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

/**
 * Apply every not-yet-recorded migration in `dir` to `schema`, in filename
 * order, each in its own transaction. Returns the ids applied this run (empty on
 * an already-current schema). Fails loud: a SQL error rolls back that migration
 * and rethrows, leaving the schema at the last fully-applied version.
 */
export async function runMigrations(pool: MigrationPool, opts: MigrationOptions): Promise<string[]> {
  const { schema, dir } = opts;
  assertIdentifier(schema);

  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS "${schema}".schema_migrations (
         id text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`
    );

    const res = await client.query(`SELECT id FROM "${schema}".schema_migrations`);
    const done = new Set(res.rows.map((r) => (r as { id: string }).id));

    for (const id of listMigrationFiles(dir)) {
      if (done.has(id)) continue;
      const sql = readFileSync(join(dir, id), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(`INSERT INTO "${schema}".schema_migrations (id) VALUES ($1)`, [id]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(`Migration "${id}" (${schema}) failed and was rolled back: ${describe(err)}`);
      }
      applied.push(id);
      console.log(`[db] applied migration ${schema}/${id}`);
    }
  } finally {
    client.release();
  }
  return applied;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
