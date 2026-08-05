import { createHash, randomBytes } from 'node:crypto';
import { Person } from '../../Domain/Aggregates/person.ts';
import { Session } from '../../Domain/Aggregates/session.ts';
import type { PersonRepository } from '../../Domain/Ports/Repositories/person-repository.ts';
import type { SessionRepository } from '../../Domain/Ports/Repositories/session-repository.ts';
import type { PasswordHasher } from '../../Domain/Ports/password-hasher.ts';
import type { AccessTokenIssuer } from '../../Domain/Ports/access-token-issuer.ts';
import { ValidationError } from '../../Domain/Exceptions/validation-error.ts';
import { ConflictError } from '../../Domain/Exceptions/conflict-error.ts';
import { UnauthorizedError } from '../../Domain/Exceptions/unauthorized-error.ts';
import { toPersonView } from '../Mappers/auth-mapper.ts';
import type { PersonView } from '../Mappers/auth-mapper.ts';
import { ROLE_USER } from '../../../Common/auth/index.ts';

// Orchestrates the authentication flows over the persons + sessions stores. It
// hashes passwords via a PasswordHasher port, issues short-lived access tokens via
// an AccessTokenIssuer port, and manages long-lived refresh tokens itself: an
// opaque random string handed to the client, persisted only as a SHA-256 hash and
// rotated on every refresh. New accounts get the default `User` role.

/** Minimum acceptable password length at registration. */
export const MIN_PASSWORD_LENGTH = 8;
/** Default refresh-token lifetime: 30 days. */
const DEFAULT_REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface AuthServiceOptions {
  /** Refresh-token lifetime in milliseconds (default: 30 days). */
  refreshTtlMs?: number;
}

/** The pair of tokens returned to the caller on login/refresh. */
export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResult extends IssuedTokens {
  person: PersonView;
}

/** SHA-256 hex of a refresh token — what we persist, so a DB leak can't be replayed. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class AuthService {
  private readonly persons: PersonRepository;
  private readonly sessions: SessionRepository;
  private readonly hasher: PasswordHasher;
  private readonly tokens: AccessTokenIssuer;
  private readonly refreshTtlMs: number;

  constructor(
    persons: PersonRepository,
    sessions: SessionRepository,
    hasher: PasswordHasher,
    tokens: AccessTokenIssuer,
    options: AuthServiceOptions = {}
  ) {
    this.persons = persons;
    this.sessions = sessions;
    this.hasher = hasher;
    this.tokens = tokens;
    this.refreshTtlMs = options.refreshTtlMs ?? DEFAULT_REFRESH_TTL_MS;
  }

  /** Register a new person with the default role. Duplicate email → 409, weak input → 400. */
  async register(email: string, password: string): Promise<PersonView> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.includes('@')) throw new ValidationError('A valid email address is required.');
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new ValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    if (await this.persons.findByEmail(normalizedEmail)) {
      throw new ConflictError('An account with that email already exists.');
    }
    const passwordHash = await this.hasher.hash(password);
    const person = Person.create({ email: normalizedEmail, passwordHash, roles: [ROLE_USER] });
    await this.persons.save(person);
    return toPersonView(person);
  }

  /** Verify credentials and start a session. Bad credentials → 401. */
  async login(email: string, password: string): Promise<LoginResult> {
    const person = await this.persons.findByEmail(email.trim().toLowerCase());
    // Verify even when the person is missing to keep timing uniform, then reject.
    const ok = person ? await this.hasher.verify(password, person.passwordHash) : false;
    if (!person || !ok) throw new UnauthorizedError('Invalid email or password.');

    const accessToken = await this.tokens.issue({ sub: person.id, roles: person.roles });
    const refreshToken = await this.startSession(person.id);
    return { person: toPersonView(person), accessToken, refreshToken };
  }

  /** Rotate a valid refresh token into a fresh access + refresh token. Invalid/expired → 401. */
  async refresh(refreshToken: string | undefined): Promise<IssuedTokens> {
    if (!refreshToken) throw new UnauthorizedError('Missing refresh token.');
    const tokenHash = hashToken(refreshToken);
    // Atomically spend the presented token: consume deletes-and-returns the row,
    // so two concurrent /refresh calls with the same token can't both rotate it.
    const session = await this.sessions.consumeByTokenHash(tokenHash);
    if (!session) throw new UnauthorizedError('Invalid refresh token.');
    // The row is already gone, so the reject paths need no extra cleanup.
    if (session.isExpired()) throw new UnauthorizedError('Expired refresh token.');
    const person = await this.persons.findById(session.personId);
    if (!person) throw new UnauthorizedError('Invalid refresh token.');

    const accessToken = await this.tokens.issue({ sub: person.id, roles: person.roles });
    const newRefreshToken = await this.startSession(person.id);
    return { accessToken, refreshToken: newRefreshToken };
  }

  /** Revoke the presented refresh token, if any (best-effort). */
  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    await this.sessions.deleteByTokenHash(hashToken(refreshToken));
  }

  /**
   * Resolve the current person by id (the access token is verified upstream by the
   * `authenticate` filter, which supplies the subject). Unknown id → 401.
   */
  async currentPerson(personId: string): Promise<PersonView> {
    const person = await this.persons.findById(personId);
    if (!person) throw new UnauthorizedError('Not authenticated.');
    return toPersonView(person);
  }

  /** Generate an opaque refresh token, persist its hash as a session, return the token. */
  private async startSession(personId: string): Promise<string> {
    const refreshToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.refreshTtlMs).toISOString();
    await this.sessions.create(Session.create({ personId, tokenHash: hashToken(refreshToken), expiresAt }));
    return refreshToken;
  }
}
