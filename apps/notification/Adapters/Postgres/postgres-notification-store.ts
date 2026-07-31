import type { Pool } from 'pg';
import type { NotificationStore } from '../../Ports/Notifications/notification-store.ts';
import type { Notification } from '../../Domain/ValueObjects/notification.ts';

/** How many notifications to retain in the recent feed (matches the old file store). */
const MAX_ENTRIES = 200;

/** The row shape as returned by pg (snake_case columns, timestamptz as Date). */
export interface NotificationRow {
  id: string;
  created_at: Date | string;
  title: string;
  message: string;
  channels: string[] | null;
  url: string | null;
  icon: string | null;
  receiver: string | null;
}

/** Pure mapper: a DB row -> the domain Notification (drops null/empty optionals). */
export function rowToNotification(row: NotificationRow): Notification {
  const n: Notification = {
    id: row.id,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    title: row.title,
    message: row.message,
  };
  if (row.channels && row.channels.length > 0) n.channels = row.channels;
  if (row.url) n.url = row.url;
  if (row.icon) n.icon = row.icon;
  if (row.receiver) n.receiver = row.receiver;
  return n;
}

/** Minimal query surface shared by pg.Pool and a pooled client (for the importer). */
interface Queryable {
  query(text: string, params?: unknown[]): Promise<unknown>;
}

/**
 * Insert one notification, idempotently (ON CONFLICT DO NOTHING keeps the
 * one-time legacy import safe to re-run). Exported so the importer reuses the
 * exact column mapping.
 */
export async function insertNotification(db: Queryable, n: Notification): Promise<void> {
  await db.query(
    `INSERT INTO notifications (id, created_at, title, message, channels, url, icon, receiver)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO NOTHING`,
    [n.id, n.createdAt, n.title, n.message, n.channels ?? null, n.url ?? null, n.icon ?? null, n.receiver ?? null]
  );
}

/**
 * NotificationStore backed by Postgres (schema `notification`). Newest-first by
 * the identity `seq`; capped at {@link MAX_ENTRIES} by trimming older rows after
 * each insert, both inside one transaction.
 */
export class PostgresNotificationStore implements NotificationStore {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async add(n: Notification): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await insertNotification(client, n);
      await client.query(
        `DELETE FROM notifications
           WHERE seq NOT IN (SELECT seq FROM notifications ORDER BY seq DESC LIMIT $1)`,
        [MAX_ENTRIES]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async recent(limit: number): Promise<Notification[]> {
    const res = await this.pool.query<NotificationRow>(
      `SELECT id, created_at, title, message, channels, url, icon, receiver
         FROM notifications ORDER BY seq DESC LIMIT $1`,
      [Math.max(0, limit)]
    );
    return res.rows.map(rowToNotification);
  }
}
