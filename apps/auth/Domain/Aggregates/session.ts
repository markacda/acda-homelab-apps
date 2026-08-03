import { randomUUID } from 'node:crypto';
import { ValidationError } from '../Exceptions/validation-error.ts';

// The Session aggregate: one persisted refresh token per active sign-in, stored
// only as a hash (token_hash) so a database leak can't be replayed. Sessions are
// rotated on refresh and deleted on logout; the `expires_at` bound lets the auth
// backend reject stale tokens even if a row lingers. Refresh-token generation and
// hashing live in the authentication backend — this aggregate just holds the hash
// and enforces the invariants (a person id, a non-blank hash, an expiry).

/** The persisted shape of a session (what the Postgres repository reads and writes). */
export interface SessionData {
  id: string;
  personId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
}

/** The fields needed to create a new session (id/createdAt are assigned here). */
export interface NewSession {
  personId: string;
  tokenHash: string;
  expiresAt: string;
}

function require(value: string | undefined, message: string): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) throw new ValidationError(message);
  return trimmed;
}

export class Session {
  readonly id: string;
  readonly personId: string;
  readonly tokenHash: string;
  readonly expiresAt: string;
  readonly createdAt: string;

  constructor(data: SessionData) {
    this.id = data.id;
    this.personId = data.personId;
    this.tokenHash = data.tokenHash;
    this.expiresAt = data.expiresAt;
    this.createdAt = data.createdAt;
  }

  static create(input: NewSession): Session {
    return new Session({
      id: randomUUID(),
      personId: require(input.personId, 'A person id is required.'),
      tokenHash: require(input.tokenHash, 'A token hash is required.'),
      expiresAt: require(input.expiresAt, 'An expiry is required.'),
      createdAt: new Date().toISOString(),
    });
  }

  static fromJSON(data: SessionData): Session {
    return new Session(data);
  }

  /** True when the session's expiry is in the past relative to `now` (default: current time). */
  isExpired(now: Date = new Date()): boolean {
    const expiresMs = Date.parse(this.expiresAt);
    return !Number.isFinite(expiresMs) || expiresMs <= now.getTime();
  }

  toJSON(): SessionData {
    return {
      id: this.id,
      personId: this.personId,
      tokenHash: this.tokenHash,
      expiresAt: this.expiresAt,
      createdAt: this.createdAt,
    };
  }
}
