import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScryptPasswordHasher } from '../Adapters/Crypto/scrypt-password-hasher.ts';

test('hash then verify accepts the correct password', async () => {
  const hasher = new ScryptPasswordHasher();
  const stored = await hasher.hash('correct horse battery staple');
  assert.match(stored, /^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
  assert.equal(await hasher.verify('correct horse battery staple', stored), true);
});

test('verify rejects a wrong password', async () => {
  const hasher = new ScryptPasswordHasher();
  const stored = await hasher.hash('s3cret-password');
  assert.equal(await hasher.verify('wrong-password', stored), false);
});

test('the same password hashes to different values (random salt)', async () => {
  const hasher = new ScryptPasswordHasher();
  const a = await hasher.hash('same-password');
  const b = await hasher.hash('same-password');
  assert.notEqual(a, b);
});

test('verify returns false for a malformed stored value', async () => {
  const hasher = new ScryptPasswordHasher();
  assert.equal(await hasher.verify('whatever', 'not-a-valid-hash'), false);
  assert.equal(await hasher.verify('whatever', 'bcrypt$abc$def'), false);
  assert.equal(await hasher.verify('whatever', 'scrypt$$'), false);
});
