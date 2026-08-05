import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { SignJWT } from 'jose';
import { createAtcGuards } from '../Application/Registrations/auth-guards.ts';
import { ROLE_USER, ROLE_ADMINISTRATOR } from '../../Common/auth/index.ts';

// Proves issue #154: ATC is User-gated. The guards are wired exactly as register.ts
// wires them (API gate in front of the /api routers, page gate in front of the
// served static frontend), but with an explicit test secret so no env/JWT_SECRET_FILE
// is needed. Uses node:http (not fetch) so 302 redirects are observed, not followed.

const SECRET = new TextEncoder().encode('test-secret-thirty-two-bytes!!aa');

/** Sign an HS256 access token the way the auth app's JoseTokenIssuer does. */
async function sign(roles: string[]): Promise<string> {
  return new SignJWT({ roles }).setProtectedHeader({ alg: 'HS256' }).setSubject('p1').setExpirationTime('5m').sign(SECRET);
}

interface Res {
  status: number;
  location?: string;
  body: string;
}

/** GET without following redirects, optionally sending an access_token cookie. */
function get(url: string, token?: string): Promise<Res> {
  return new Promise((resolve, reject) => {
    const headers = token ? { cookie: `access_token=${token}` } : {};
    http
      .get(url, { headers }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, location: res.headers.location, body }));
      })
      .on('error', reject);
  });
}

async function startTestServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const { requireApiUser, requireUserPage } = createAtcGuards({ secret: SECRET });
  const app = express();
  app.use('/api', requireApiUser);
  app.get('/api/runways', (_req, res) => {
    res.json({ runways: [] });
  });
  app.use(requireUserPage);
  app.get('/', (_req, res) => {
    res.send('PAGE');
  });
  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test('API — no session cookie → 401', async (t) => {
  const { url, close } = await startTestServer();
  t.after(close);
  const res = await get(`${url}/api/runways`);
  assert.equal(res.status, 401);
});

test('API — a User → 200', async (t) => {
  const { url, close } = await startTestServer();
  t.after(close);
  const res = await get(`${url}/api/runways`, await sign([ROLE_USER]));
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(res.body), { runways: [] });
});

test('API — a signed-in account without the User role → 403', async (t) => {
  const { url, close } = await startTestServer();
  t.after(close);
  const res = await get(`${url}/api/runways`, await sign(['SomethingElse']));
  assert.equal(res.status, 403);
  assert.deepEqual(JSON.parse(res.body), { error: 'forbidden' });
});

test('API — an Administrator (also has User) → 200', async (t) => {
  const { url, close } = await startTestServer();
  t.after(close);
  const res = await get(`${url}/api/runways`, await sign([ROLE_USER, ROLE_ADMINISTRATOR]));
  assert.equal(res.status, 200);
});

test('page — no session cookie → 302 to the auth login', async (t) => {
  const { url, close } = await startTestServer();
  t.after(close);
  const res = await get(`${url}/`);
  assert.equal(res.status, 302);
  assert.equal(res.location, '/auth/?redirect=%2Fatc%2F');
});

test('page — a signed-in account without the User role → 403', async (t) => {
  const { url, close } = await startTestServer();
  t.after(close);
  const res = await get(`${url}/`, await sign(['SomethingElse']));
  assert.equal(res.status, 403);
});

test('page — a User → 200 (frontend served)', async (t) => {
  const { url, close } = await startTestServer();
  t.after(close);
  const res = await get(`${url}/`, await sign([ROLE_USER]));
  assert.equal(res.status, 200);
  assert.equal(res.body, 'PAGE');
});

test('/healthz stays public (page guard skips it)', async (t) => {
  const { url, close } = await startTestServer();
  t.after(close);
  const res = await get(`${url}/healthz`);
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(res.body), { status: 'ok' });
});
