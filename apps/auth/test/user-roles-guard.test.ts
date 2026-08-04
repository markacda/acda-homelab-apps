import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { SignJWT } from 'jose';
import { UserController } from '../Application/Controllers/user-controller.ts';
import { UserAdminService } from '../Application/Services/user-admin-service.ts';
import { errorMapping } from '../Application/Filters/error-mapping.ts';
import { createAuth, ROLE_ADMINISTRATOR, ROLE_USER } from '../../Common/auth/index.ts';

// Proves the acceptance criterion: /api/users is Administrator-gated. The guard is
// mounted the same way register.ts mounts it — in front of the UserController
// router — but with an explicit test secret so no env/JWT_SECRET_FILE is needed.

const SECRET = new TextEncoder().encode('test-secret-thirty-two-bytes!!aa');

const fakeSvc = {
  async listUsers() {
    return [];
  },
} as unknown as UserAdminService;

/** Sign an HS256 access token the way the auth app's JoseTokenIssuer does. */
async function sign(roles: string[]): Promise<string> {
  return new SignJWT({ roles }).setProtectedHeader({ alg: 'HS256' }).setSubject('p1').setExpirationTime('5m').sign(SECRET);
}

async function startTestServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const { requireRole } = createAuth({ secret: SECRET });
  const app = express();
  app.use(express.json());
  app.use('/api/users', requireRole(ROLE_ADMINISTRATOR), new UserController(fakeSvc).router);
  app.use(errorMapping());
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test('no session cookie → 401', async (t) => {
  const { url, close } = await startTestServer();
  t.after(close);
  const res = await fetch(`${url}/api/users`);
  assert.equal(res.status, 401);
});

test('a non-Administrator (User only) → 403', async (t) => {
  const { url, close } = await startTestServer();
  t.after(close);
  const token = await sign([ROLE_USER]);
  const res = await fetch(`${url}/api/users`, { headers: { cookie: `access_token=${token}` } });
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: 'forbidden' });
});

test('an Administrator → 200', async (t) => {
  const { url, close } = await startTestServer();
  t.after(close);
  const token = await sign([ROLE_USER, ROLE_ADMINISTRATOR]);
  const res = await fetch(`${url}/api/users`, { headers: { cookie: `access_token=${token}` } });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), []);
});
