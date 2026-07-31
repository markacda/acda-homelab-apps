import type { Pool } from 'pg';

/**
 * Liveness ping for a DB app's /healthz. Runs a trivial `SELECT 1`; throws if
 * the database is unreachable. Wire it into startServer's `healthCheck` hook so
 * the container healthcheck reports unhealthy when the DB connection is down.
 */
export async function pingDb(pool: Pool): Promise<void> {
  await pool.query('SELECT 1');
}
