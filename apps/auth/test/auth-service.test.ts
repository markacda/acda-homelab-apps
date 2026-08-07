import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Person } from '../Domain/Aggregates/person.ts';
import type { PersonRepository } from '../Domain/Ports/Repositories/person-repository.ts';
import { Session } from '../Domain/Aggregates/session.ts';
import type { SessionRepository } from '../Domain/Ports/Repositories/session-repository.ts';
import type { PasswordHasher } from '../Domain/Ports/password-hasher.ts';
import type { AccessTokenClaims, AccessTokenIssuer } from '../Domain/Ports/access-token-issuer.ts';
import { AuthService } from '../Application/Services/auth-service.ts';
import { ValidationError } from '../Domain/Exceptions/validation-error.ts';
import { ConflictError } from '../Domain/Exceptions/conflict-error.ts';
import { UnauthorizedError } from '../Domain/Exceptions/unauthorized-error.ts';

/** The required name every register() call needs (issue #187). */
const ADA = { firstName: 'Ada', lastName: 'Lovelace' };

// In-memory fakes of the ports — the service is pure orchestration, so no DB or crypto is needed.

class FakePersonRepository implements PersonRepository {
  readonly byId = new Map<string, Person>();
  async findByEmail(email: string): Promise<Person | null> {
    for (const p of this.byId.values()) if (p.email.value === email) return p;
    return null;
  }
  async findById(id: string): Promise<Person | null> {
    return this.byId.get(id) ?? null;
  }
  async list(): Promise<Person[]> {
    return [...this.byId.values()];
  }
  async save(person: Person): Promise<void> {
    this.byId.set(person.id, person);
  }
  async delete(id: string): Promise<void> {
    this.byId.delete(id);
  }
}

class FakeSessionRepository implements SessionRepository {
  readonly byHash = new Map<string, Session>();
  async create(session: Session): Promise<void> {
    this.byHash.set(session.tokenHash, session);
  }
  async findByTokenHash(tokenHash: string): Promise<Session | null> {
    return this.byHash.get(tokenHash) ?? null;
  }
  async consumeByTokenHash(tokenHash: string): Promise<Session | null> {
    const session = this.byHash.get(tokenHash) ?? null;
    if (session) this.byHash.delete(tokenHash);
    return session;
  }
  async deleteByTokenHash(tokenHash: string): Promise<void> {
    this.byHash.delete(tokenHash);
  }
  async deleteById(id: string): Promise<void> {
    for (const [hash, s] of this.byHash) if (s.id === id) this.byHash.delete(hash);
  }
}

// Reversible "hash" so verify is trivial to reason about in tests.
const fakeHasher: PasswordHasher = {
  async hash(plain) {
    return `hashed:${plain}`;
  },
  async verify(plain, storedHash) {
    return storedHash === `hashed:${plain}`;
  },
};

const fakeTokens: AccessTokenIssuer = {
  async issue(claims: AccessTokenClaims) {
    return `token:${claims.sub}:${claims.roles.join(',')}`;
  },
  async verify(token: string) {
    const [, sub, roles] = token.split(':');
    return { sub, roles: roles ? roles.split(',') : [] };
  },
};

function makeService(options?: { refreshTtlMs?: number }): {
  service: AuthService;
  persons: FakePersonRepository;
  sessions: FakeSessionRepository;
} {
  const persons = new FakePersonRepository();
  const sessions = new FakeSessionRepository();
  const service = new AuthService(persons, sessions, fakeHasher, fakeTokens, options);
  return { service, persons, sessions };
}

test('register creates a person with the default User role', async () => {
  const { service, persons } = makeService();
  const view = await service.register('Alice@Example.com', 'password123', ADA);
  assert.equal(view.email, 'alice@example.com');
  assert.deepEqual(view.roles, ['User']);
  const stored = await persons.findByEmail('alice@example.com');
  assert.equal(stored?.passwordHash, 'hashed:password123');
});

test('register stores the trimmed first and last name', async () => {
  const { service } = makeService();
  const view = await service.register('alice@example.com', 'password123', { firstName: '  Ada ', lastName: ' Lovelace  ' });
  assert.equal(view.firstName, 'Ada');
  assert.equal(view.lastName, 'Lovelace');
});

test('register rejects a missing or over-long name', async () => {
  const { service } = makeService();
  const cases = [
    { firstName: '', lastName: 'Lovelace' },
    { firstName: 'Ada', lastName: '   ' },
    { firstName: 'x'.repeat(101), lastName: 'Lovelace' },
  ];
  for (const name of cases) {
    await assert.rejects(() => service.register('alice@example.com', 'password123', name), ValidationError);
  }
});

test('register rejects a duplicate email with a ConflictError', async () => {
  const { service } = makeService();
  await service.register('alice@example.com', 'password123', ADA);
  await assert.rejects(() => service.register('alice@example.com', 'password123', ADA), ConflictError);
});

test('register rejects a too-short password and a malformed email', async () => {
  const { service } = makeService();
  await assert.rejects(() => service.register('bob@example.com', 'short', ADA), ValidationError);
  await assert.rejects(() => service.register('not-an-email', 'password123', ADA), ValidationError);
});

test('login returns tokens and persists a session', async () => {
  const { service, sessions } = makeService();
  await service.register('alice@example.com', 'password123', ADA);
  const result = await service.login('alice@example.com', 'password123');
  assert.equal(result.person.email, 'alice@example.com');
  assert.ok(result.accessToken.startsWith('token:'));
  assert.ok(result.refreshToken.length > 0);
  assert.equal(sessions.byHash.size, 1);
});

test('login with a wrong password or unknown email is unauthorized', async () => {
  const { service } = makeService();
  await service.register('alice@example.com', 'password123', ADA);
  await assert.rejects(() => service.login('alice@example.com', 'wrong-password'), UnauthorizedError);
  await assert.rejects(() => service.login('ghost@example.com', 'password123'), UnauthorizedError);
});

test('refresh rotates the token: the old one stops working, a new session exists', async () => {
  const { service, sessions } = makeService();
  await service.register('alice@example.com', 'password123', ADA);
  const { refreshToken } = await service.login('alice@example.com', 'password123');

  const rotated = await service.refresh(refreshToken);
  assert.ok(rotated.accessToken.startsWith('token:'));
  assert.notEqual(rotated.refreshToken, refreshToken);
  assert.equal(sessions.byHash.size, 1);
  // The retired token is no longer accepted.
  await assert.rejects(() => service.refresh(refreshToken), UnauthorizedError);
  // The freshly issued one is.
  const again = await service.refresh(rotated.refreshToken);
  assert.ok(again.accessToken.startsWith('token:'));
});

test('refresh consumes the presented token atomically: a second use is rejected', async () => {
  const { service, sessions } = makeService();
  await service.register('alice@example.com', 'password123', ADA);
  const { refreshToken } = await service.login('alice@example.com', 'password123');

  // Consume the token out from under the flow (as a concurrent /refresh would).
  const consumed = await sessions.consumeByTokenHash(createHash('sha256').update(refreshToken).digest('hex'));
  assert.ok(consumed);
  // The now-spent token can no longer be rotated, and no session was minted.
  await assert.rejects(() => service.refresh(refreshToken), UnauthorizedError);
  assert.equal(sessions.byHash.size, 0);
});

test('refresh rejects a missing or unknown token', async () => {
  const { service } = makeService();
  await assert.rejects(() => service.refresh(undefined), UnauthorizedError);
  await assert.rejects(() => service.refresh('bogus'), UnauthorizedError);
});

test('refresh rejects and cleans up an expired session', async () => {
  const { service, sessions } = makeService({ refreshTtlMs: -1000 }); // already expired on creation
  await service.register('alice@example.com', 'password123', ADA);
  const { refreshToken } = await service.login('alice@example.com', 'password123');
  assert.equal(sessions.byHash.size, 1);
  await assert.rejects(() => service.refresh(refreshToken), UnauthorizedError);
  assert.equal(sessions.byHash.size, 0);
});

test('logout revokes the refresh session', async () => {
  const { service, sessions } = makeService();
  await service.register('alice@example.com', 'password123', ADA);
  const { refreshToken } = await service.login('alice@example.com', 'password123');
  await service.logout(refreshToken);
  assert.equal(sessions.byHash.size, 0);
  await assert.rejects(() => service.refresh(refreshToken), UnauthorizedError);
});

test('currentPerson returns the person view, or 401 for an unknown id', async () => {
  const { service } = makeService();
  const view = await service.register('alice@example.com', 'password123', ADA);
  const me = await service.currentPerson(view.id);
  assert.equal(me.email, 'alice@example.com');
  assert.equal(me.firstName, 'Ada');
  assert.deepEqual(me.roles, ['User']);
  await assert.rejects(() => service.currentPerson('missing-id'), UnauthorizedError);
});

test('updateName persists the new name and returns the updated view', async () => {
  const { service, persons } = makeService();
  const view = await service.register('alice@example.com', 'password123', ADA);
  const updated = await service.updateName(view.id, { firstName: ' Grace ', lastName: 'Hopper' });
  assert.equal(updated.firstName, 'Grace');
  assert.equal(updated.lastName, 'Hopper');
  // Unchanged fields survive the rename.
  assert.equal(updated.email, 'alice@example.com');
  assert.deepEqual(updated.roles, ['User']);
  assert.equal((await persons.findById(view.id))?.firstName?.value, 'Grace');
});

test('updateName rejects a blank name and an unknown id', async () => {
  const { service } = makeService();
  const view = await service.register('alice@example.com', 'password123', ADA);
  await assert.rejects(() => service.updateName(view.id, { firstName: '  ', lastName: 'Hopper' }), ValidationError);
  await assert.rejects(() => service.updateName('missing-id', { firstName: 'Grace', lastName: 'Hopper' }), UnauthorizedError);
});
