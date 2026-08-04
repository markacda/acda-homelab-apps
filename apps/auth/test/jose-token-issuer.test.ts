import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { SignJWT } from 'jose';
import { JoseTokenIssuer } from '../Adapters/Jwt/jose-token-issuer.ts';
import { UnauthorizedError } from '../Domain/Exceptions/unauthorized-error.ts';

const secret = new Uint8Array(randomBytes(32));

test('issue then verify round-trips the subject and roles', async () => {
  const issuer = new JoseTokenIssuer(secret, '7d');
  const token = await issuer.issue({ sub: 'p1', roles: ['User', 'Administrator'] });
  const claims = await issuer.verify(token);
  assert.equal(claims.sub, 'p1');
  assert.deepEqual(claims.roles, ['User', 'Administrator']);
});

test('verify defaults roles to an empty array when the claim is absent', async () => {
  const issuer = new JoseTokenIssuer(secret, '7d');
  const bare = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject('p2').setExpirationTime('1h').sign(secret);
  const claims = await issuer.verify(bare);
  assert.deepEqual(claims.roles, []);
});

test('verify rejects a tampered token', async () => {
  const issuer = new JoseTokenIssuer(secret, '7d');
  const token = await issuer.issue({ sub: 'p1', roles: ['User'] });
  const tampered = token.slice(0, -2) + (token.endsWith('a') ? 'bb' : 'aa');
  await assert.rejects(() => issuer.verify(tampered), UnauthorizedError);
});

test('verify rejects a token signed with a different secret', async () => {
  const issuer = new JoseTokenIssuer(secret, '7d');
  const foreign = await new SignJWT({ roles: ['User'] })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('p1')
    .setExpirationTime('1h')
    .sign(new Uint8Array(randomBytes(32)));
  await assert.rejects(() => issuer.verify(foreign), UnauthorizedError);
});

test('verify rejects an expired token', async () => {
  const issuer = new JoseTokenIssuer(secret, '7d');
  const expired = await new SignJWT({ roles: ['User'] })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('p1')
    .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
    .sign(secret);
  await assert.rejects(() => issuer.verify(expired), UnauthorizedError);
});
