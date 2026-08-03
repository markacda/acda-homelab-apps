import type { Session } from '../../Aggregates/session.ts';

/** Persistence port for refresh-token sessions. Implemented in the Adapters layer. */
export interface SessionRepository {
  /** Persist a new session (the refresh token is stored only as its hash). */
  create(session: Session): Promise<void>;
  /** Look a session up by the stored hash of its refresh token. */
  findByTokenHash(tokenHash: string): Promise<Session | null>;
  /** Delete the session whose refresh token hashes to this value (revoke / rotate). */
  deleteByTokenHash(tokenHash: string): Promise<void>;
  /** Delete a session by its id. */
  deleteById(id: string): Promise<void>;
}
