import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FirstName } from '../Domain/ValueObjects/first-name.ts';
import { LastName } from '../Domain/ValueObjects/last-name.ts';
import { MAX_NAME_LENGTH } from '../Domain/ValueObjects/personal-name.ts';
import { ValidationError } from '../Domain/Exceptions/validation-error.ts';

// Control characters are built with fromCharCode so this file stays plain text.
const BELL = String.fromCharCode(7);
const NEL = String.fromCharCode(0x85);
const LINE_SEPARATOR = String.fromCharCode(0x2028);

test('a name is trimmed and its whitespace runs collapse to single spaces', () => {
  assert.equal(new FirstName('  Ada    Lovelace  ').value, 'Ada Lovelace');
  assert.equal(new LastName(['Ada', 'Lovelace'].join('\t\t')).value, 'Ada Lovelace');
});

test('a line break in a name becomes a space instead of joining the words', () => {
  assert.equal(new FirstName(['Ada', 'Lovelace'].join('\n')).value, 'Ada Lovelace');
  assert.equal(new FirstName(['Ada', 'Lovelace'].join(LINE_SEPARATOR)).value, 'Ada Lovelace');
});

test('a name strips non-whitespace control characters', () => {
  assert.equal(new FirstName(`Ada${BELL}${NEL} Lovelace`).value, 'Ada Lovelace');
});

test('a name normalizes to NFC so composed and decomposed input match', () => {
  const decomposed = ['Ren', String.fromCharCode(0x65, 0x301), 'e'].join('');
  assert.equal(new FirstName(decomposed).value, new FirstName('Renée').value);
});

test('a name keeps markup as literal text (rendering escapes it, not this)', () => {
  assert.equal(new LastName('<img src=x onerror=alert(1)>').value, '<img src=x onerror=alert(1)>');
});

test('a blank or non-string name is rejected with the field name in the message', () => {
  assert.throws(
    () => new FirstName('  '),
    (err: unknown) => err instanceof ValidationError && err.message === 'A first name is required.'
  );
  assert.throws(
    () => new LastName(undefined),
    (err: unknown) => err instanceof ValidationError && err.message === 'A last name is required.'
  );
  for (const value of [null, 42, {}, ['Ada'], BELL]) {
    assert.throws(() => new FirstName(value), ValidationError, `expected ${String(value)} to be rejected`);
  }
});

test('a name is capped, measured in code points', () => {
  assert.equal(new FirstName('x'.repeat(MAX_NAME_LENGTH)).value.length, MAX_NAME_LENGTH);
  assert.throws(() => new FirstName('x'.repeat(MAX_NAME_LENGTH + 1)), ValidationError);
  // An emoji is one code point but two UTF-16 units, so it must not be charged twice.
  assert.equal(new LastName('😀'.repeat(MAX_NAME_LENGTH)).value, '😀'.repeat(MAX_NAME_LENGTH));
  assert.throws(() => new LastName('😀'.repeat(MAX_NAME_LENGTH + 1)), ValidationError);
});

test('a name renders as its value when interpolated', () => {
  assert.equal(`${new FirstName('Ada')} ${new LastName('Lovelace')}`, 'Ada Lovelace');
});
