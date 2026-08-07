import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { SignJWT } from 'jose';
import { createRoleGuards } from '../page-guard.ts';
import { ROLE_USER, ROLE_ADMINISTRATOR } from '../index.ts';

// Covers the shared page/API guard factory the frontend apps (atc, recipe-book,
// log-viewer) delegate to. An explicit test secret is injected so no env is needed.
// Uses node:http (not fetch) so 302 redirects are observed, not followed.

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

/** Wire the guards exactly as an app's register() does, with a couple of extra public prefixes for coverage. */
async function startTestServer(apiPublicPrefixes?: string[]): Promise<{ url: string; close: () => Promise<void> }> {
  const { requireApi, requirePage } = createRoleGuards({
    role: ROLE_ADMINISTRATOR,
    appHome: '/logs/',
    forbiddenMessage: 'Your account is signed in but is not allowed to view the logs.',
    apiPublicPrefixes,
    secret: SECRET,
  });
  const app = express();
  app.use('/api', requireApi);
  app.get('/api/thing', (_req, res) => res.json({ ok: true }));
  if (apiPublicPrefixes?.includes('/images')) {
    app.use('/images', requireApi);
    app.get('/images/x.jpg', (_req, res) => res.send('IMG'));
  }
  app.use(requirePage);
  app.get('/', (_req, res) => res.send('PAGE'));
  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

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
  assert.equal((await get(`${url}/api/thing`)).status, 401);
});

test('API — the required role → 200', async (t) => {
  const { url, close } = await startTestServer();
  t.after(close);
  const res = await get(`${url}/api/thing`, await sign([ROLE_ADMINISTRATOR]));
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(res.body), { ok: true });
});

test('API — signed in without the role → 403 forbidden JSON', async (t) => {
  const { url, close } = await startTestServer();
  t.after(close);
  const res = await get(`${url}/api/thing`, await sign([ROLE_USER]));
  assert.equal(res.status, 403);
  assert.deepEqual(JSON.parse(res.body), { error: 'forbidden' });
});

test('page — no session cookie → 302 to the auth login with redirect back to appHome', async (t) => {
  const { url, close } = await startTestServer();
  t.after(close);
  const res = await get(`${url}/`);
  assert.equal(res.status, 302);
  assert.equal(res.location, '/auth/?redirect=%2Flogs%2F');
});

test('page — signed in without the role → 403 HTML naming the role', async (t) => {
  const { url, close } = await startTestServer();
  t.after(close);
  const res = await get(`${url}/`, await sign([ROLE_USER]));
  assert.equal(res.status, 403);
  assert.match(res.body, /Administrator role required/);
});

test('page — the required role → 200 (content served)', async (t) => {
  const { url, close } = await startTestServer();
  t.after(close);
  const res = await get(`${url}/`, await sign([ROLE_ADMINISTRATOR]));
  assert.equal(res.status, 200);
  assert.equal(res.body, 'PAGE');
});

test('/healthz stays public (page guard skips it)', async (t) => {
  const { url, close } = await startTestServer();
  t.after(close);
  assert.equal((await get(`${url}/healthz`)).status, 200);
});

test('extra apiPublicPrefixes — /images is left to the API gate (JSON 401, not a 302)', async (t) => {
  const { url, close } = await startTestServer(['/api', '/images']);
  t.after(close);
  // Unauthenticated: the API gate answers 401 rather than the page guard's 302.
  assert.equal((await get(`${url}/images/x.jpg`)).status, 401);
  // Authorized: served.
  const ok = await get(`${url}/images/x.jpg`, await sign([ROLE_ADMINISTRATOR]));
  assert.equal(ok.status, 200);
  assert.equal(ok.body, 'IMG');
});

// --- Trusted-embed bypass (issue #186) ---------------------------------------

const TRUSTED_ORIGIN = 'http://ha.local:8123';

interface ReqOptions {
  token?: string;
  referer?: string;
  cookie?: string;
}

/** GET with arbitrary headers, capturing the Set-Cookie so a grant can be replayed. */
function req(url: string, opts: ReqOptions = {}): Promise<Res & { setCookie?: string }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    const cookies = [opts.token ? `access_token=${opts.token}` : '', opts.cookie ?? ''].filter(Boolean);
    if (cookies.length) headers.cookie = cookies.join('; ');
    if (opts.referer) headers.referer = opts.referer;
    http
      .get(url, { headers }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            location: res.headers.location,
            body,
            setCookie: res.headers['set-cookie']?.[0],
          })
        );
      })
      .on('error', reject);
  });
}

/** Just the `name=value` pair from a Set-Cookie header, ready to send back as a Cookie. */
function cookiePair(setCookie: string | undefined): string {
  return (setCookie ?? '').split(';')[0];
}

/** A guard set that opts into the embed bypass, as ATC does (role User, appHome /atc/). */
async function startEmbedServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const { requireApi, requirePage } = createRoleGuards({
    role: ROLE_USER,
    appHome: '/atc/',
    forbiddenMessage: 'not allowed',
    trustedEmbedOrigins: [TRUSTED_ORIGIN],
    secret: SECRET,
  });
  const app = express();
  app.use('/api', requireApi);
  app.get('/api/thing', (_req, res) => res.json({ ok: true }));
  app.use(requirePage);
  app.get('/', (_req, res) => res.send('PAGE'));

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

test('embed — a request from the trusted origin is served and handed a grant cookie', async (t) => {
  const { url, close } = await startEmbedServer();
  t.after(close);
  const res = await req(`${url}/`, { referer: `${TRUSTED_ORIGIN}/lovelace/atc` });
  assert.equal(res.status, 200);
  assert.equal(res.body, 'PAGE');
  assert.match(res.setCookie ?? '', /^embed_grant=/);
});

test('embed — the issued grant cookie then authorizes page + api without a trusted Referer', async (t) => {
  const { url, close } = await startEmbedServer();
  t.after(close);
  const first = await req(`${url}/`, { referer: `${TRUSTED_ORIGIN}/` });
  const grant = cookiePair(first.setCookie);
  assert.equal((await req(`${url}/`, { cookie: grant })).status, 200);
  const api = await req(`${url}/api/thing`, { cookie: grant });
  assert.equal(api.status, 200);
  assert.deepEqual(JSON.parse(api.body), { ok: true });
});

test('embed — an untrusted request is still gated (page 302, api 401)', async (t) => {
  const { url, close } = await startEmbedServer();
  t.after(close);
  assert.equal((await req(`${url}/`, { referer: 'http://evil.local/' })).status, 302);
  assert.equal((await req(`${url}/api/thing`)).status, 401);
});

test('embed — a grant minted for another app does not authorize this one', async (t) => {
  const { url, close } = await startEmbedServer();
  t.after(close);
  const otherApp = await new SignJWT({ embed: '/receptenboek/' }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('5m').sign(SECRET);
  const res = await req(`${url}/`, { cookie: `embed_grant=${otherApp}` });
  assert.equal(res.status, 302);
});

test('embed — the bypass is inert when trustedEmbedOrigins is unset', async (t) => {
  const { url, close } = await startTestServer();
  t.after(close);
  // startTestServer configures no trusted origins, so an HA-looking Referer is ignored.
  assert.equal((await req(`${url}/`, { referer: `${TRUSTED_ORIGIN}/` })).status, 302);
});
