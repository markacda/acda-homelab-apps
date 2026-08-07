import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EmailAddress, MAX_EMAIL_LENGTH } from '../Domain/ValueObjects/email-address.ts';
import { ValidationError } from '../Domain/Exceptions/validation-error.ts';

const MALFORMED = ['not-an-email', '@example.com', 'alice@', 'a@b@c.com', 'ali ce@example.com', '  ', undefined, 42];

test('an address is normalized to a trimmed lowercase value', () => {
  assert.equal(new EmailAddress('  Alice@Example.COM ').value, 'alice@example.com');
});

test('a malformed address is rejected', () => {
  for (const bad of MALFORMED) {
    assert.throws(() => new EmailAddress(bad), ValidationError, `expected ${String(bad)} to be rejected`);
  }
});

test('an over-long address is rejected', () => {
  assert.throws(() => new EmailAddress(`${'a'.repeat(MAX_EMAIL_LENGTH)}@example.com`), ValidationError);
});

test('normalize matches the constructor for a valid address', () => {
  assert.equal(EmailAddress.normalize('  Alice@Example.COM '), new EmailAddress('  Alice@Example.COM ').value);
});

test('normalize accepts what the constructor rejects, so login can answer 401 instead of 400', () => {
  assert.equal(EmailAddress.normalize('  NOT-an-email '), 'not-an-email');
  assert.equal(EmailAddress.normalize(undefined), '');
});

test('an address renders as its value when interpolated', () => {
  assert.equal(`${new EmailAddress('Alice@Example.com')}`, 'alice@example.com');
});
