import { readFileSync } from 'node:fs';
import pg from 'pg';
import type { Pool, PoolConfig } from 'pg';
import { logDependency } from '../access-log/logger.ts';

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
  const pool = new pg.Pool(config);
  instrumentQueries(pool, name);
  return pool;
}

// Longest SQL statement text we keep on a dependency record; a guard against a
// pathological generated query bloating dependencies.log.
const MAX_SQL_LEN = 2000;

/** The raw query text from a query string or a `{ text }` config object. */
function sqlText(arg: unknown): string {
  const text =
    typeof arg === 'string'
      ? arg
      : arg && typeof arg === 'object' && 'text' in arg && typeof (arg as { text: unknown }).text === 'string'
        ? (arg as { text: string }).text
        : '';
  const trimmed = text.trim();
  return trimmed.length > MAX_SQL_LEN ? trimmed.slice(0, MAX_SQL_LEN) + '…' : trimmed;
}

/** Leading SQL keyword (SELECT/INSERT/…) from a query text or config object. */
function sqlVerb(arg: unknown): string {
  const m = sqlText(arg).match(/^(\w+)/);
  return m ? m[1].toUpperCase() : 'QUERY';
}

/**
 * Wrap `pool.query` so each query is timed and recorded as a postgres dependency
 * (see @homelab/access-log). Transparent: arguments and the resolved result pass
 * through untouched and logging never throws. The callback form and non-promise
 * (query-stream) form are passed straight through; queries issued via an explicit
 * `pool.connect()` client — e.g. inside a transaction — are not captured here.
 */
function instrumentQueries(pool: Pool, name?: string): void {
  const app = name ?? 'app';
  const original = pool.query.bind(pool) as (...args: unknown[]) => unknown;
  const wrapped = (...args: unknown[]): unknown => {
    if (typeof args[args.length - 1] === 'function') return original(...args); // callback form
    const start = process.hrtime.bigint();
    const verb = sqlVerb(args[0]);
    const command = sqlText(args[0]) || undefined;
    const durationMs = (): number => Math.round(Number(process.hrtime.bigint() - start) / 1e3) / 1e3;
    const record = (success: boolean, error?: string): void =>
      logDependency({ type: 'postgres', target: 'db', name: verb, durationMs: durationMs(), success, error, command }, app);
    let result: unknown;
    try {
      result = original(...args);
    } catch (err) {
      record(false, (err as Error).message);
      throw err;
    }
    // Not a thenable (e.g. a Submittable query stream) — pass through untimed.
    if (!result || typeof (result as { then?: unknown }).then !== 'function') return result;
    return (result as Promise<unknown>).then(
      (res) => {
        record(true);
        return res;
      },
      (err: unknown) => {
        record(false, (err as Error).message);
        throw err;
      }
    );
  };
  pool.query = wrapped as typeof pool.query;
}

/** Close a pool, swallowing errors — safe to call from an onShutdown hook. */
export async function closePool(pool: Pool): Promise<void> {
  await pool.end().catch(() => {});
}
