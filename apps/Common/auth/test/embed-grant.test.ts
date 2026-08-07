import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { EMBED_COOKIE, issueEmbedGrant, matchesEmbedToken, matchesTrustedOrigin, verifyEmbedGrant } from '../embed-grant.ts';

// The trusted-embed grant primitives (issue #186): origin matching + a signed,
// app-scoped grant cookie. An explicit test secret keeps these off the env.

const SECRET = new TextEncoder().encode('test-secret-thirty-two-bytes!!aa');
const TRUSTED = ['http://192.168.1.50:8123', 'http://homeassistant.local:8123'];

/** Minimal Request exposing only the case-insensitive header getter these helpers use. */
function reqWith(headers: Record<string, string>): Request {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return { get: (name: string) => lower[name.toLowerCase()] } as unknown as Request;
}

/** Minimal Request carrying only a parsed query string. */
function reqWithQuery(query: Record<string, unknown>): Request {
  return { query, get: () => undefined } as unknown as Request;
}

/** A Response that captures whatever issueEmbedGrant sets via res.cookie. */
function capturingRes(): { res: Response; cookie: () => string | undefined } {
  let cookie: string | undefined;
  const res = {
    cookie: (name: string, value: string) => {
      if (name === EMBED_COOKIE) cookie = value;
    },
  } as unknown as Response;
  return { res, cookie: () => cookie };
}

test('matchesTrustedOrigin — Origin header matches', () => {
  assert.equal(matchesTrustedOrigin(reqWith({ origin: 'http://192.168.1.50:8123' }), TRUSTED), true);
});

test('matchesTrustedOrigin — falls back to the origin of the Referer', () => {
  assert.equal(matchesTrustedOrigin(reqWith({ referer: 'http://homeassistant.local:8123/lovelace/atc' }), TRUSTED), true);
});

test('matchesTrustedOrigin — an untrusted origin does not match', () => {
  assert.equal(matchesTrustedOrigin(reqWith({ origin: 'http://192.168.1.50:6001' }), TRUSTED), false);
  assert.equal(matchesTrustedOrigin(reqWith({ referer: 'http://evil.local/' }), TRUSTED), false);
});

test('matchesTrustedOrigin — no headers, or an empty trust list, never matches', () => {
  assert.equal(matchesTrustedOrigin(reqWith({}), TRUSTED), false);
  assert.equal(matchesTrustedOrigin(reqWith({ origin: 'http://192.168.1.50:8123' }), []), false);
});

test('matchesEmbedToken — the exact token in ?embed_token matches', () => {
  assert.equal(matchesEmbedToken(reqWithQuery({ embed_token: 'sekrit' }), 'sekrit'), true);
});

test('matchesEmbedToken — a wrong, absent or non-string token does not match', () => {
  assert.equal(matchesEmbedToken(reqWithQuery({ embed_token: 'nope' }), 'sekrit'), false);
  assert.equal(matchesEmbedToken(reqWithQuery({ embed_token: 'sekri' }), 'sekrit'), false); // length differs
  assert.equal(matchesEmbedToken(reqWithQuery({}), 'sekrit'), false);
  // A repeated param parses to an array, which must not be coerced into a match.
  assert.equal(matchesEmbedToken(reqWithQuery({ embed_token: ['sekrit'] }), 'sekrit'), false);
});

test('matchesEmbedToken — an unconfigured token never matches', () => {
  assert.equal(matchesEmbedToken(reqWithQuery({ embed_token: 'anything' }), undefined), false);
  assert.equal(matchesEmbedToken(reqWithQuery({ embed_token: '' }), ''), false);
});

test('issueEmbedGrant → verifyEmbedGrant round-trips for the same scope', async () => {
  const cap = capturingRes();
  await issueEmbedGrant(cap.res, { secret: SECRET, scope: '/atc/', secure: false });
  const grant = cap.cookie();
  assert.ok(grant, 'a grant cookie was set');
  assert.equal(await verifyEmbedGrant(grant!, SECRET, '/atc/'), true);
});

test('verifyEmbedGrant — a grant scoped to another app is rejected', async () => {
  const cap = capturingRes();
  await issueEmbedGrant(cap.res, { secret: SECRET, scope: '/atc/', secure: false });
  assert.equal(await verifyEmbedGrant(cap.cookie()!, SECRET, '/receptenboek/'), false);
});

test('verifyEmbedGrant — a bad signature or garbage token is rejected', async () => {
  assert.equal(await verifyEmbedGrant('not-a-jwt', SECRET, '/atc/'), false);
  const other = new TextEncoder().encode('another-secret-thirty-two-byte!!');
  const cap = capturingRes();
  await issueEmbedGrant(cap.res, { secret: other, scope: '/atc/', secure: false });
  assert.equal(await verifyEmbedGrant(cap.cookie()!, SECRET, '/atc/'), false);
});

test('issueEmbedGrant — an already-expired grant does not verify', async () => {
  const cap = capturingRes();
  await issueEmbedGrant(cap.res, { secret: SECRET, scope: '/atc/', secure: false, maxAgeMs: -1000 });
  assert.equal(await verifyEmbedGrant(cap.cookie()!, SECRET, '/atc/'), false);
});
