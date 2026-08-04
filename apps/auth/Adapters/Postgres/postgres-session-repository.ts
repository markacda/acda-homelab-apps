import type { Pool } from 'pg';
import { Session } from '../../Domain/Aggregates/session.ts';
import type { SessionRepository } from '../../Domain/Ports/Repositories/session-repository.ts';

// SessionRepository backed by the `sessions` table: one row per active refresh
// token, stored only as `token_hash`. Rotated on refresh (atomic consume +
// create) and deleted on logout. Timestamps come back from pg as Date and are normalized to
// ISO strings for the aggregate.

/** A `sessions` row as returned by pg. */
export interface SessionRow {
  id: string;
  person_id: string;
  token_hash: string;
  expires_at: Date | string;
  created_at: Date | string;
}

const toIso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : v);

/** Pure mapper: a sessions row -> the Session aggregate. Exported for tests. */
export function rowToSession(row: SessionRow): Session {
  return Session.fromJSON({
    id: row.id,
    personId: row.person_id,
    tokenHash: row.token_hash,
    expiresAt: toIso(row.expires_at),
    createdAt: toIso(row.created_at),
  });
}

export class PostgresSessionRepository implements SessionRepository {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async create(session: Session): Promise<void> {
    const data = session.toJSON();
    await this.pool.query(
      `INSERT INTO sessions (id, person_id, token_hash, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
      [data.id, data.personId, data.tokenHash, data.expiresAt, data.createdAt]
    );
  }

  async findByTokenHash(tokenHash: string): Promise<Session | null> {
    const res = await this.pool.query<SessionRow>(
      `SELECT id, person_id, token_hash, expires_at, created_at
         FROM sessions WHERE token_hash = $1`,
      [tokenHash]
    );
    return res.rows[0] ? rowToSession(res.rows[0]) : null;
  }

  async consumeByTokenHash(tokenHash: string): Promise<Session | null> {
    // Atomic delete-and-return: only one concurrent caller gets the row back,
    // so a rotated/replayed refresh token can be spent exactly once.
    const res = await this.pool.query<SessionRow>(
      `DELETE FROM sessions WHERE token_hash = $1
         RETURNING id, person_id, token_hash, expires_at, created_at`,
      [tokenHash]
    );
    return res.rows[0] ? rowToSession(res.rows[0]) : null;
  }

  async deleteByTokenHash(tokenHash: string): Promise<void> {
    await this.pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
  }

  async deleteById(id: string): Promise<void> {
    await this.pool.query('DELETE FROM sessions WHERE id = $1', [id]);
  }
}
