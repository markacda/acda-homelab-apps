import type { Pool } from 'pg';

// Shared JSONB persistence for the recipe-book aggregates. Each aggregate is
// stored as one row: its `id`, its serialized aggregate in a `jsonb` `data`
// column, and `updated_at` lifted out for newest-first ordering + indexing.
// The repositories wrap these with their aggregate's fromJSON/toJSON, so the
// domain layer is untouched. Structured recipe/book/category data lives here;
// image bytes and generated PDFs stay on the data volume.

/** The minimum an aggregate's serialized form must expose to be stored. */
export interface StorableData {
  id: string;
  updatedAt: string;
}

/** Table names are code-owned constants; guard before interpolating as an identifier. */
function ident(table: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw new Error(`Unsafe table name: ${JSON.stringify(table)}`);
  return `"${table}"`;
}

/** All rows' `data`, newest-updated first. */
export async function listJson<T>(pool: Pool, table: string): Promise<T[]> {
  const res = await pool.query<{ data: T }>(`SELECT data FROM ${ident(table)} ORDER BY updated_at DESC`);
  return res.rows.map((r) => r.data);
}

/** One row's `data` by id, or null. */
export async function getJson<T>(pool: Pool, table: string, id: string): Promise<T | null> {
  const res = await pool.query<{ data: T }>(`SELECT data FROM ${ident(table)} WHERE id = $1`, [id]);
  return res.rows[0]?.data ?? null;
}

/** Insert or replace a row (node-pg serializes the object to jsonb). */
export async function upsertJson<T extends StorableData>(pool: Pool, table: string, data: T): Promise<void> {
  await pool.query(
    `INSERT INTO ${ident(table)} (id, data, updated_at) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
    [data.id, data, data.updatedAt]
  );
}

export async function deleteJson(pool: Pool, table: string, id: string): Promise<void> {
  await pool.query(`DELETE FROM ${ident(table)} WHERE id = $1`, [id]);
}

/** Row count for a table (used by the one-time legacy importer's empty-guard). */
export async function countRows(pool: Pool, table: string): Promise<number> {
  const res = await pool.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${ident(table)}`);
  return Number(res.rows[0]?.count ?? '0');
}
