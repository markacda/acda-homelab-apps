import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanText,
  requireEmail,
  requirePassword,
  requireText,
  MAX_NAME_LENGTH,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from '../Domain/Values/person-text.ts';
import { ValidationError } from '../Domain/Exceptions/validation-error.ts';

// Control characters are built with fromCharCode so this file stays plain text.
const BELL = String.fromCharCode(7);
const NEL = String.fromCharCode(0x85);
const LINE_SEPARATOR = String.fromCharCode(0x2028);

test('cleanText trims and collapses whitespace runs to single spaces', () => {
  assert.equal(cleanText('  Ada    Lovelace  '), 'Ada Lovelace');
  assert.equal(cleanText(['Ada', 'Lovelace'].join('\t\t')), 'Ada Lovelace');
});

test('cleanText turns line breaks into a space instead of joining the words', () => {
  assert.equal(cleanText(['Ada', 'Lovelace'].join('\n')), 'Ada Lovelace');
  assert.equal(cleanText(['Ada', 'Lovelace'].join(LINE_SEPARATOR)), 'Ada Lovelace');
});

test('cleanText strips non-whitespace control characters', () => {
  assert.equal(cleanText(`Ada${BELL}${NEL} Lovelace`), 'Ada Lovelace');
});

test('cleanText normalizes to NFC so composed and decomposed input match', () => {
  const decomposed = ['Ren', String.fromCharCode(0x65, 0x301), 'e'].join('');
  assert.equal(cleanText(decomposed), cleanText('Renée'));
});

test('cleanText returns an empty string for a non-string or blank value', () => {
  for (const value of [undefined, null, 42, {}, [], '   ', BELL]) {
    assert.equal(cleanText(value), '');
  }
});

test('cleanText leaves markup as literal text (rendering escapes it, not this)', () => {
  assert.equal(cleanText('<img src=x onerror=alert(1)>'), '<img src=x onerror=alert(1)>');
});

test('requireText rejects a blank value with the field name in the message', () => {
  assert.throws(
    () => requireText('  ', 'First name'),
    (err: Error) => {
      assert.ok(err instanceof ValidationError);
      assert.equal(err.message, 'A first name is required.');
      return true;
    }
  );
});

test('requireText enforces the length cap, measured in code points', () => {
  assert.equal(requireText('x'.repeat(MAX_NAME_LENGTH), 'First name').length, MAX_NAME_LENGTH);
  assert.throws(() => requireText('x'.repeat(MAX_NAME_LENGTH + 1), 'First name'), ValidationError);
  // A 100-emoji name is 200 UTF-16 units but only 100 code points, so it passes.
  assert.equal(requireText('😀'.repeat(MAX_NAME_LENGTH), 'First name'), '😀'.repeat(MAX_NAME_LENGTH));
  assert.throws(() => requireText('😀'.repeat(MAX_NAME_LENGTH + 1), 'First name'), ValidationError);
});

test('requireEmail normalizes to a trimmed lowercase address', () => {
  assert.equal(requireEmail('  Alice@Example.COM '), 'alice@example.com');
});

test('requireEmail rejects a malformed address', () => {
  for (const bad of ['no-at', 'a@', '@b', 'a@@b', 'a@b@c', '', '   ', undefined, 42]) {
    assert.throws(() => requireEmail(bad), ValidationError, `expected ${String(bad)} to be rejected`);
  }
});

test('requireEmail rejects an over-long address', () => {
  assert.throws(() => requireEmail(`${'a'.repeat(250)}@example.com`), ValidationError);
});

test('requirePassword enforces the length bounds but never alters the secret', () => {
  const spacey = '  pass word  ';
  assert.equal(requirePassword(spacey), spacey);
  assert.throws(() => requirePassword('x'.repeat(MIN_PASSWORD_LENGTH - 1)), ValidationError);
  assert.throws(() => requirePassword('x'.repeat(MAX_PASSWORD_LENGTH + 1)), ValidationError);
  assert.throws(() => requirePassword(undefined), ValidationError);
});
