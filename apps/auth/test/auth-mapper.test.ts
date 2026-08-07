import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  requirePassword,
  toCredentials,
  toPersonName,
  toRegistration,
} from '../Application/Mappers/auth-mapper.ts';
import { ValidationError } from '../Domain/Exceptions/validation-error.ts';

test('requirePassword enforces the length bounds but never alters the secret', () => {
  const spacey = '  s3cret with spaces  ';
  assert.equal(requirePassword(spacey), spacey);
  assert.throws(() => requirePassword('x'.repeat(MIN_PASSWORD_LENGTH - 1)), ValidationError);
  assert.throws(() => requirePassword('x'.repeat(MAX_PASSWORD_LENGTH + 1)), ValidationError);
  assert.throws(() => requirePassword(undefined), ValidationError);
});

test('toCredentials normalizes the email without judging its shape', () => {
  assert.deepEqual(toCredentials({ email: '  NOT-an-email ', password: 'whatever' }), {
    email: 'not-an-email',
    password: 'whatever',
  });
});

test('toCredentials still requires both fields to be present', () => {
  assert.throws(() => toCredentials({ password: 'whatever' }), ValidationError);
  assert.throws(() => toCredentials({ email: 'a@b.com' }), ValidationError);
});

test('toRegistration normalizes every field', () => {
  assert.deepEqual(toRegistration({ email: ' Ada@Example.COM ', password: 'sup3rsecret', firstName: '  Ada  ', lastName: ' Lovelace ' }), {
    email: 'ada@example.com',
    password: 'sup3rsecret',
    firstName: 'Ada',
    lastName: 'Lovelace',
  });
});

test('toRegistration rejects a malformed email, a weak password or a blank name', () => {
  const valid = { email: 'ada@example.com', password: 'sup3rsecret', firstName: 'Ada', lastName: 'Lovelace' };
  assert.throws(() => toRegistration({ ...valid, email: 'not-an-email' }), ValidationError);
  assert.throws(() => toRegistration({ ...valid, password: 'short' }), ValidationError);
  assert.throws(() => toRegistration({ ...valid, firstName: '   ' }), ValidationError);
  assert.throws(() => toRegistration({ ...valid, lastName: undefined }), ValidationError);
});

test('toPersonName requires both names and cleans them', () => {
  assert.deepEqual(toPersonName({ firstName: ' Grace ', lastName: ' Hopper ' }), {
    firstName: 'Grace',
    lastName: 'Hopper',
  });
  assert.throws(() => toPersonName({ firstName: 'Grace' }), ValidationError);
  assert.throws(() => toPersonName(undefined), ValidationError);
});
