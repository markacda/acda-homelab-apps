import { readFileSync } from 'node:fs';
import pg from 'pg';
import type { Pool, PoolConfig } from 'pg';

// Shared PostgreSQL connection pool factory. Every data-owning app builds its
// pool here so connection sourcing, sizing and shutdown behave identically.
//
// Connection sourcing precedence (first match wins):
//   1. DATABASE_URL_FILE — path to a file whose sole contents are the connection
//      string. This is the Docker-secrets convention used in this repo: the db
//      container generates a per-app password on first boot and writes the full
//      URL to a shared read-only `db-secrets` volume, so no password ever appears
//      in an image, in compose, in env, or in git.
//   2. DATABASE_URL — the connection string inline (handy for local dev/tests).
//   3. Discrete PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD (node-postgres reads
//      these itself when no explicit config is given).

/** Pool size ceiling. Small: these apps are low-traffic and run on a Pi. */
const MAX_POOL = Number(process.env.PG_POOL_MAX) || 5;

/** Resolve the connection string from the env, or undefined to fall back to PG*. */
function resolveConnectionString(): string | undefined {
  const file = process.env.DATABASE_URL_FILE;
  if (file) {
    const url = readFileSync(file, 'utf8').trim();
    if (!url) throw new Error(`DATABASE_URL_FILE "${file}" is empty`);
    return url;
  }
  return process.env.DATABASE_URL || undefined;
}

/**
 * Build a pg.Pool. Pass `name` to tag connections (shown in pg_stat_activity as
 * application_name), which makes per-app activity legible on the shared server.
 */
export function createPool(name?: string): Pool {
  const config: PoolConfig = { max: MAX_POOL };
  const connectionString = resolveConnectionString();
  if (connectionString) config.connectionString = connectionString;
  if (name) config.application_name = name;
  return new pg.Pool(config);
}

/** Close a pool, swallowing errors — safe to call from an onShutdown hook. */
export async function closePool(pool: Pool): Promise<void> {
  await pool.end().catch(() => {});
}
