import type { Pool } from 'pg';
import { withTags } from '../access-log/logger.ts';

/**
 * Liveness ping for a DB app's /healthz. Runs a trivial `SELECT 1`; throws if
 * the database is unreachable. Wire it into startServer's `healthCheck` hook so
 * the container healthcheck reports unhealthy when the DB connection is down.
 *
 * Tagged "Healthcheck" so the Log Viewer can hide these frequent liveness pings
 * from the dependency list by default (they'd otherwise dominate it).
 */
export async function pingDb(pool: Pool): Promise<void> {
  await withTags(['Healthcheck'], () => pool.query('SELECT 1'));
}
