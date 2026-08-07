import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { UserController } from '../Application/Controllers/user-controller.ts';
import { UserAdminService } from '../Application/Services/user-admin-service.ts';
import { errorMapping } from '../Application/Filters/error-mapping.ts';
import { NotFoundError } from '../Domain/Exceptions/not-found-error.ts';
import { ValidationError } from '../Domain/Exceptions/validation-error.ts';

const aliceView = { id: 'p1', email: 'alice@example.com', firstName: 'Ada', lastName: 'Lovelace', roles: ['User'] };
const adminView = { ...aliceView, roles: ['User', 'Administrator'] };

// Records the last search term the controller passed through, so we can assert
// the ?search= query param is forwarded to the service.
let lastSearch: string | undefined;

// A fake UserAdminService — the controller (its routing + parsing) is what's under
// test. The guard is mounted separately in register.ts, so it's absent here.
const fakeSvc = {
  async listUsers(search?: string) {
    lastSearch = search;
    return search ? [aliceView] : [aliceView, { id: 'p2', email: 'bob@work.test', firstName: 'Grace', lastName: 'Hopper', roles: ['User'] }];
  },
  async addRole(id: string, role: string) {
    if (id === 'missing') throw new NotFoundError('No user with that id.');
    if (role === 'root') throw new ValidationError('Unknown role.');
    return adminView;
  },
  async removeRole(id: string) {
    if (id === 'missing') throw new NotFoundError('No user with that id.');
    return aliceView;
  },
} as unknown as UserAdminService;

async function startTestServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const app = express();
  app.use(express.json());
  app.use('/api/users', new UserController(fakeSvc).router);
  app.use(errorMapping());
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test('GET /api/users returns the list', async (t) => {
  const { url, close } = await startTestServer();
  t.after(close);
  const res = await fetch(`${url}/api/users`);
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as unknown[]).length, 2);
});

test('GET /api/users?search=x forwards the search term', async (t) => {
  const { url, close } = await startTestServer();
  t.after(close);
  const res = await fetch(`${url}/api/users?search=alice`);
  assert.equal(res.status, 200);
  assert.equal(lastSearch, 'alice');
  assert.deepEqual(await res.json(), [aliceView]);
});

test('POST /api/users/:id/roles adds a role and returns the updated view', async (t) => {
  const { url, close } = await startTestServer();
  t.after(close);
  const res = await fetch(`${url}/api/users/p1/roles`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role: 'Administrator' }),
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), adminView);
});

test('POST /api/users/:id/roles with no role is a 400', async (t) => {
  const { url, close } = await startTestServer();
  t.after(close);
  const res = await fetch(`${url}/api/users/p1/roles`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
});

test('DELETE /api/users/:id/roles/:role removes a role and returns the updated view', async (t) => {
  const { url, close } = await startTestServer();
  t.after(close);
  const res = await fetch(`${url}/api/users/p1/roles/Administrator`, { method: 'DELETE' });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), aliceView);
});

test('POST for an unknown user id is a 404 (errorMapping wiring)', async (t) => {
  const { url, close } = await startTestServer();
  t.after(close);
  const res = await fetch(`${url}/api/users/missing/roles`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role: 'User' }),
  });
  assert.equal(res.status, 404);
});
