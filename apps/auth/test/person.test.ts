import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Person } from '../Domain/Aggregates/person.ts';
import { ValidationError } from '../Domain/Exceptions/validation-error.ts';

test('create normalizes the email (trim + lowercase) and assigns id/createdAt', () => {
  const p = Person.create({ email: '  Alice@Example.COM ', passwordHash: 'hash' });
  assert.equal(p.email, 'alice@example.com');
  assert.ok(p.id);
  assert.ok(p.createdAt);
  assert.deepEqual(p.roles, []);
});

test('create rejects a blank email', () => {
  assert.throws(() => Person.create({ email: '   ', passwordHash: 'hash' }), ValidationError);
});

test('create rejects a blank password hash', () => {
  assert.throws(() => Person.create({ email: 'a@b.com', passwordHash: '  ' }), ValidationError);
});

test('create de-duplicates and trims roles', () => {
  const p = Person.create({
    email: 'a@b.com',
    passwordHash: 'h',
    roles: ['User', ' User ', 'Administrator'],
  });
  assert.deepEqual(p.roles, ['User', 'Administrator']);
});

test('addRole / hasRole / removeRole manage the role set idempotently', () => {
  const p = Person.create({ email: 'a@b.com', passwordHash: 'h' });
  assert.equal(p.hasRole('User'), false);
  p.addRole('User');
  p.addRole('User');
  assert.equal(p.hasRole('User'), true);
  assert.deepEqual(p.roles, ['User']);
  p.removeRole('User');
  assert.equal(p.hasRole('User'), false);
});

test('addRole rejects a blank role', () => {
  const p = Person.create({ email: 'a@b.com', passwordHash: 'h' });
  assert.throws(() => p.addRole('  '), ValidationError);
});

test('fromJSON / toJSON round-trip preserves the persisted shape', () => {
  const data = {
    id: 'p1',
    email: 'a@b.com',
    passwordHash: 'h',
    roles: ['User'],
    createdAt: '2026-08-03T00:00:00.000Z',
  };
  assert.deepEqual(Person.fromJSON(data).toJSON(), data);
});
