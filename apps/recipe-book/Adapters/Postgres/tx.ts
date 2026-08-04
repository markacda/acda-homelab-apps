import type { Pool, PoolClient } from 'pg';

// A recipe/book save now touches several tables (the aggregate row plus its
// ordered child collections), so writes run inside a single transaction on one
// pooled client. Queries issued via an explicit pool.connect() client aren't
// captured by @homelab/db's per-query dependency logging (only pool.query is),
// which is fine — the reads still go through pool.query.

/** Run `fn` inside one transaction: BEGIN, then COMMIT on success / ROLLBACK on error. */
export async function withTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
