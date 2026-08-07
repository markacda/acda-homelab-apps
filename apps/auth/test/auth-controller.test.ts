import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { AuthController } from '../Application/Controllers/auth-controller.ts';
import { AuthService } from '../Application/Services/auth-service.ts';
import type { AccessTokenIssuer } from '../Domain/Ports/access-token-issuer.ts';
import { errorMapping } from '../Application/Filters/error-mapping.ts';
import { UnauthorizedError } from '../Domain/Exceptions/unauthorized-error.ts';

const aliceView = { id: 'p1', email: 'alice@example.com', firstName: 'Ada', lastName: 'Lovelace', roles: ['User'] };
const renamedView = { ...aliceView, firstName: 'Grace', lastName: 'Hopper' };

/** A valid register body; individual tests drop or override fields. */
const registerBody = { email: 'alice@example.com', password: 'password123', firstName: 'Ada', lastName: 'Lovelace' };

// A fake AuthService that returns canned results — the controller is what's under test.
const fakeAuth = {
  async register() {
    return aliceView;
  },
  async updateName() {
    return renamedView;
  },
  async login() {
    return { person: aliceView, accessToken: 'access-jwt', refreshToken: 'refresh-token' };
  },
  async refresh() {
    return { accessToken: 'access-jwt-2', refreshToken: 'refresh-token-2' };
  },
  async logout() {},
  async currentPerson() {
    return aliceView;
  },
} as unknown as AuthService;

// Verifies only a known-good access token, mirroring the real issuer's contract.
const fakeTokens: AccessTokenIssuer = {
  async issue() {
    return 'access-jwt';
  },
  async verify(token: string) {
    if (token !== 'good-access') throw new UnauthorizedError('Invalid or expired token.');
    return { sub: 'p1', roles: ['User'] };
  },
};

/** Start an ephemeral server hosting the auth controller; returns base URL + closer. */
async function startTestServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const app = express();
  app.use(express.json());
  app.use('/api', new AuthController(fakeAuth, fakeTokens).router);
  app.use(errorMapping());
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test('POST /api/register returns 201 with the person view', async (t) => {
  const { url, close } = await startTestServer();
  t.after(close);
  const res = await fetch(`${url}/api/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(registerBody),
  });
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), aliceView);
});

test('POST /api/register without credentials is a 400', async (t) => {
  const { url, close } = await startTestServer();
  t.after(close);
  const res = await fetch(`${url}/api/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
});

test('POST /api/register without a first or last name is a 400', async (t) => {
  const { url, close } = await startTestServer();
  t.after(close);
  for (const missing of ['firstName', 'lastName'] as const) {
    const body: Record<string, unknown> = { ...registerBody };
    delete body[missing];
    const res = await fetch(`${url}/api/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal(res.status, 400, `expected a 400 without ${missing}`);
  }
});

test('POST /api/login sets Secure, httpOnly, root-path session cookies', async (t) => {
  const { url, close } = await startTestServer();
  t.after(close);
  const res = await fetch(`${url}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'alice@example.com', password: 'password123' }),
  });
  assert.equal(res.status, 200);
  const cookies = res.headers.getSetCookie();
  const access = cookies.find((c) => c.startsWith('access_token='));
  const refresh = cookies.find((c) => c.startsWith('refresh_token='));
  assert.ok(access, 'access_token cookie is set');
  assert.ok(refresh, 'refresh_token cookie is set');
  for (const cookie of [access!, refresh!]) {
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /Path=\//);
    assert.match(cookie, /SameSite=Lax/i);
    assert.match(cookie, /Secure/i); // default; COOKIE_SECURE!=='false'
    assert.doesNotMatch(cookie, /Domain=/i); // no Domain → shared across the single origin
  }
});

test('GET /api/me without a cookie is 401', async (t) => {
  const { url, close } = await startTestServer();
  t.after(close);
  const res = await fetch(`${url}/api/me`);
  assert.equal(res.status, 401);
});

test('GET /api/me with a valid access cookie returns the person', async (t) => {
  const { url, close } = await startTestServer();
  t.after(close);
  const res = await fetch(`${url}/api/me`, { headers: { cookie: 'access_token=good-access' } });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), aliceView);
});

test('PATCH /api/me without a cookie is 401', async (t) => {
  const { url, close } = await startTestServer();
  t.after(close);
  const res = await fetch(`${url}/api/me`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ firstName: 'Grace', lastName: 'Hopper' }),
  });
  assert.equal(res.status, 401);
});

test('PATCH /api/me with a valid access cookie returns the renamed person', async (t) => {
  const { url, close } = await startTestServer();
  t.after(close);
  const res = await fetch(`${url}/api/me`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie: 'access_token=good-access' },
    body: JSON.stringify({ firstName: 'Grace', lastName: 'Hopper' }),
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), renamedView);
});

test('PATCH /api/me with a blank or over-long name is a 400', async (t) => {
  const { url, close } = await startTestServer();
  t.after(close);
  for (const body of [{ lastName: 'Hopper' }, { firstName: '   ', lastName: 'Hopper' }, { firstName: 'x'.repeat(101), lastName: 'Hopper' }]) {
    const res = await fetch(`${url}/api/me`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: 'access_token=good-access' },
      body: JSON.stringify(body),
    });
    assert.equal(res.status, 400, `expected a 400 for ${JSON.stringify(body)}`);
  }
});

test('POST /api/logout is 204 and clears both cookies', async (t) => {
  const { url, close } = await startTestServer();
  t.after(close);
  const res = await fetch(`${url}/api/logout`, { method: 'POST' });
  assert.equal(res.status, 204);
  const cookies = res.headers.getSetCookie();
  assert.ok(cookies.some((c) => c.startsWith('access_token=') && /Expires=Thu, 01 Jan 1970/.test(c)));
  assert.ok(cookies.some((c) => c.startsWith('refresh_token=') && /Expires=Thu, 01 Jan 1970/.test(c)));
});
