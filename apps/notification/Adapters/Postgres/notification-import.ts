import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';
import type { Notification } from '../../Domain/ValueObjects/notification.ts';
import { insertNotification } from './postgres-notification-store.ts';

/**
 * One-time, idempotent import of the legacy file-backed feed into Postgres.
 * Runs at startup, after migrations. A no-op when the table already has rows or
 * the JSON file is absent, so it is safe to leave in place and to re-run; it can
 * be removed once every deployment has cut over (see docs/database-migration.md).
 * Returns the number of rows imported.
 */
export async function importLegacyNotifications(pool: Pool, jsonPath: string): Promise<number> {
  const countRes = await pool.query<{ count: string }>('SELECT count(*)::text AS count FROM notifications');
  if (Number(countRes.rows[0]?.count ?? '0') > 0) return 0;

  let raw: string;
  try {
    raw = await readFile(jsonPath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw err;
  }

  const parsed = JSON.parse(raw) as Notification[];
  if (!Array.isArray(parsed) || parsed.length === 0) return 0;

  // The file is newest-first; insert oldest-first so the identity `seq` matches
  // chronological order (newest ends up with the highest seq).
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const n of [...parsed].reverse()) {
      await insertNotification(client, n);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  console.log(`[import] notifications: imported ${parsed.length} row(s) from ${jsonPath}`);
  return parsed.length;
}
