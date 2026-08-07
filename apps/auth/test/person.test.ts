import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Person } from '../Domain/Aggregates/person.ts';
import type { PersonData } from '../Domain/Aggregates/person.ts';
import { ValidationError } from '../Domain/Exceptions/validation-error.ts';

/** The minimum valid input for Person.create, overridable per test. */
function newPerson(overrides: Partial<Parameters<typeof Person.create>[0]> = {}) {
  return { email: 'a@b.com', firstName: 'Ada', lastName: 'Lovelace', passwordHash: 'hash', ...overrides };
}

/** A persisted row, overridable per test. */
function storedPerson(overrides: Partial<PersonData> = {}): PersonData {
  return {
    id: 'p1',
    email: 'a@b.com',
    firstName: 'Ada',
    lastName: 'Lovelace',
    passwordHash: 'h',
    roles: [],
    createdAt: '2026-08-03T00:00:00.000Z',
    ...overrides,
  };
}

test('create normalizes the email (trim + lowercase) and assigns id/createdAt', () => {
  const p = Person.create(newPerson({ email: '  Alice@Example.COM ' }));
  assert.equal(p.email.value, 'alice@example.com');
  assert.ok(p.id);
  assert.ok(p.createdAt);
  assert.deepEqual(p.roles, []);
});

test('create requires and trims both names', () => {
  const p = Person.create(newPerson({ firstName: '  Ada  ', lastName: '  Lovelace ' }));
  assert.equal(p.firstName?.value, 'Ada');
  assert.equal(p.lastName?.value, 'Lovelace');
  assert.equal(p.hasName(), true);
});

test('create rejects a blank or over-long name', () => {
  assert.throws(() => Person.create(newPerson({ firstName: '   ' })), ValidationError);
  assert.throws(() => Person.create(newPerson({ lastName: '' })), ValidationError);
  assert.throws(() => Person.create(newPerson({ firstName: 'x'.repeat(101) })), ValidationError);
  assert.throws(() => Person.create(newPerson({ lastName: 'x'.repeat(101) })), ValidationError);
});

test('create rejects a blank or malformed email', () => {
  assert.throws(() => Person.create(newPerson({ email: '   ' })), ValidationError);
  assert.throws(() => Person.create(newPerson({ email: 'not-an-email' })), ValidationError);
});

test('create rejects a blank password hash', () => {
  assert.throws(() => Person.create(newPerson({ passwordHash: '  ' })), ValidationError);
});

test('create de-duplicates and trims roles', () => {
  const p = Person.create(newPerson({ roles: ['User', ' User ', 'Administrator'] }));
  assert.deepEqual(p.roles, ['User', 'Administrator']);
});

test('rename updates both names, trimming them', () => {
  const p = Person.create(newPerson());
  p.rename('  Grace  ', ' Hopper ');
  assert.equal(p.firstName?.value, 'Grace');
  assert.equal(p.lastName?.value, 'Hopper');
});

test('rename rejects a blank or over-long name, leaving the person untouched', () => {
  const p = Person.create(newPerson());
  assert.throws(() => p.rename('  ', 'Hopper'), ValidationError);
  assert.throws(() => p.rename('Grace', ''), ValidationError);
  assert.throws(() => p.rename('x'.repeat(101), 'Hopper'), ValidationError);
  assert.equal(p.firstName?.value, 'Ada');
  assert.equal(p.lastName?.value, 'Lovelace');
});

test('fromJSON reads the blank names of a pre-#187 account as null, which hasName() reports', () => {
  const p = Person.fromJSON(storedPerson({ firstName: '', lastName: '' }));
  assert.equal(p.firstName, null);
  assert.equal(p.lastName, null);
  assert.equal(p.hasName(), false);
  // Renaming is how such an account completes itself.
  p.rename('Ada', 'Lovelace');
  assert.equal(p.hasName(), true);
});

test('fromJSON still enforces the invariants a stored row cannot break', () => {
  assert.throws(() => Person.fromJSON(storedPerson({ email: 'not-an-email' })), ValidationError);
  assert.throws(() => Person.fromJSON(storedPerson({ passwordHash: '  ' })), ValidationError);
  assert.throws(() => Person.fromJSON(storedPerson({ firstName: 'x'.repeat(101) })), ValidationError);
});

test('addRole / hasRole / removeRole manage the role set idempotently', () => {
  const p = Person.create(newPerson());
  assert.equal(p.hasRole('User'), false);
  p.addRole('User');
  p.addRole('User');
  assert.equal(p.hasRole('User'), true);
  assert.deepEqual(p.roles, ['User']);
  p.removeRole('User');
  assert.equal(p.hasRole('User'), false);
});

test('addRole rejects a blank role', () => {
  const p = Person.create(newPerson());
  assert.throws(() => p.addRole('  '), ValidationError);
});

test('fromJSON / toJSON round-trip preserves the persisted shape', () => {
  const data = storedPerson({ roles: ['User'] });
  assert.deepEqual(Person.fromJSON(data).toJSON(), data);
});

test('toJSON writes a not-yet-filled name back as a blank string', () => {
  const data = storedPerson({ firstName: '', lastName: '' });
  assert.deepEqual(Person.fromJSON(data).toJSON(), data);
});
