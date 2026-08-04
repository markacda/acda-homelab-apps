import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UserAdminService } from '../Application/Services/user-admin-service.ts';
import { Person } from '../Domain/Aggregates/person.ts';
import type { PersonRepository } from '../Domain/Ports/Repositories/person-repository.ts';

// An in-memory PersonRepository double. save() replaces the stored person (its
// role set included), mirroring the Postgres adapter's wholesale role replace.
function fakeRepo(seed: Person[] = []): PersonRepository {
  const store = new Map<string, Person>(seed.map((p) => [p.id, p]));
  return {
    async findByEmail(email) {
      return [...store.values()].find((p) => p.email === email) ?? null;
    },
    async findById(id) {
      return store.get(id) ?? null;
    },
    async list() {
      return [...store.values()];
    },
    async save(person) {
      store.set(person.id, Person.fromJSON(person.toJSON()));
    },
    async delete(id) {
      store.delete(id);
    },
  };
}

function seedPeople(): { alice: Person; bob: Person } {
  const alice = Person.create({ email: 'alice@example.com', passwordHash: 'h', roles: ['User'] });
  const bob = Person.create({ email: 'bob@work.test', passwordHash: 'h', roles: ['User', 'Administrator'] });
  return { alice, bob };
}

test('listUsers returns every user as a safe view (no passwordHash)', async () => {
  const { alice, bob } = seedPeople();
  const svc = new UserAdminService(fakeRepo([alice, bob]));
  const views = await svc.listUsers();
  assert.equal(views.length, 2);
  const emails = views.map((v) => v.email).sort();
  assert.deepEqual(emails, ['alice@example.com', 'bob@work.test']);
  assert.ok(!('passwordHash' in views[0]));
});

test('listUsers filters by email substring, case-insensitively', async () => {
  const { alice, bob } = seedPeople();
  const svc = new UserAdminService(fakeRepo([alice, bob]));
  assert.deepEqual(
    (await svc.listUsers('ALICE')).map((v) => v.email),
    ['alice@example.com']
  );
  assert.deepEqual(
    (await svc.listUsers('work')).map((v) => v.email),
    ['bob@work.test']
  );
  // Whitespace-only search is treated as no filter.
  assert.equal((await svc.listUsers('   ')).length, 2);
});

test('addRole persists the role and returns the updated view', async () => {
  const { alice } = seedPeople();
  const repo = fakeRepo([alice]);
  const svc = new UserAdminService(repo);
  const view = await svc.addRole(alice.id, 'Administrator');
  assert.deepEqual(view.roles.sort(), ['Administrator', 'User']);
  assert.deepEqual((await repo.findById(alice.id))!.roles.sort(), ['Administrator', 'User']);
});

test('addRole is idempotent — adding an existing role does not duplicate', async () => {
  const { alice } = seedPeople();
  const svc = new UserAdminService(fakeRepo([alice]));
  const view = await svc.addRole(alice.id, 'User');
  assert.deepEqual(view.roles, ['User']);
});

test('removeRole persists the removal; removing an absent role is a no-op', async () => {
  const { bob } = seedPeople();
  const repo = fakeRepo([bob]);
  const svc = new UserAdminService(repo);
  const view = await svc.removeRole(bob.id, 'Administrator');
  assert.deepEqual(view.roles, ['User']);
  // Removing it again is idempotent.
  const again = await svc.removeRole(bob.id, 'Administrator');
  assert.deepEqual(again.roles, ['User']);
});

test('unknown user id → NotFoundError (404) for add and remove', async () => {
  const svc = new UserAdminService(fakeRepo());
  await assert.rejects(svc.addRole('nope', 'User'), (err: { status?: number }) => err.status === 404);
  await assert.rejects(svc.removeRole('nope', 'User'), (err: { status?: number }) => err.status === 404);
});

test('unknown role → ValidationError (400) for add and remove', async () => {
  const { alice } = seedPeople();
  const svc = new UserAdminService(fakeRepo([alice]));
  await assert.rejects(svc.addRole(alice.id, 'root'), (err: { status?: number }) => err.status === 400);
  await assert.rejects(svc.removeRole(alice.id, ''), (err: { status?: number }) => err.status === 400);
});
