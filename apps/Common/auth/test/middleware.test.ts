import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import { createAuth } from '../middleware.ts';
import { requireRole, ROLE_ADMINISTRATOR, ROLE_USER } from '../index.ts';

// A fixed 32-byte secret shared by the signer and the verifier under test.
const SECRET = new TextEncoder().encode('test-secret-thirty-two-bytes!!aa');

// Sign an HS256 access token the way the auth app's JoseTokenIssuer does.
async function sign(opts: { sub?: string; roles?: string[]; expSeconds?: number; iatSeconds?: number } = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ roles: opts.roles ?? [ROLE_USER] })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(opts.sub ?? 'person-1')
    .setIssuedAt(opts.iatSeconds ?? now)
    .setExpirationTime(opts.expSeconds ?? now + 3600)
    .sign(SECRET);
}

// Minimal req/res doubles — the guards only touch these members.
function fakeReq(opts: { path?: string; cookie?: string } = {}) {
  return { path: opts.path ?? '/api/x', headers: opts.cookie ? { cookie: opts.cookie } : {} };
}
function fakeRes() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    locals: {} as Record<string, unknown>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}
function spyNext() {
  let calls = 0;
  const next = () => {
    calls += 1;
  };
  return { next, calls: () => calls };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyCast = (x: unknown) => x as any;

const { requireAuth } = createAuth({ secret: SECRET });

test('no cookie → 401 unauthorized', async () => {
  const res = fakeRes();
  const next = spyNext();
  await requireAuth(anyCast(fakeReq()), anyCast(res), anyCast(next.next));
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'unauthorized' });
  assert.equal(next.calls(), 0);
});

test('expired token → 401 unauthorized', async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = await sign({ expSeconds: now - 60, iatSeconds: now - 120 });
  const res = fakeRes();
  const next = spyNext();
  await requireAuth(anyCast(fakeReq({ cookie: `access_token=${token}` })), anyCast(res), anyCast(next.next));
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'unauthorized' });
  assert.equal(next.calls(), 0);
});

test('invalid/tampered token → 401 unauthorized', async () => {
  const token = await sign();
  const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
  const res = fakeRes();
  const next = spyNext();
  await requireAuth(anyCast(fakeReq({ cookie: `access_token=${tampered}` })), anyCast(res), anyCast(next.next));
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'unauthorized' });
  assert.equal(next.calls(), 0);
});

test('valid token missing the required role → 403 forbidden', async () => {
  const token = await sign({ roles: [ROLE_USER] });
  const { requireRole: rr } = createAuth({ secret: SECRET });
  const res = fakeRes();
  const next = spyNext();
  await rr(ROLE_ADMINISTRATOR)(anyCast(fakeReq({ cookie: `access_token=${token}` })), anyCast(res), anyCast(next.next));
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: 'forbidden' });
  assert.equal(next.calls(), 0);
});

test('valid token with the required role → next() and claims on res.locals.auth', async () => {
  const token = await sign({ sub: 'person-42', roles: [ROLE_USER, ROLE_ADMINISTRATOR] });
  const { requireRole: rr } = createAuth({ secret: SECRET });
  const res = fakeRes();
  const next = spyNext();
  await rr(ROLE_ADMINISTRATOR)(anyCast(fakeReq({ cookie: `access_token=${token}` })), anyCast(res), anyCast(next.next));
  assert.equal(next.calls(), 1);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.locals.auth, { sub: 'person-42', roles: [ROLE_USER, ROLE_ADMINISTRATOR] });
});

test('/healthz is never gated — no cookie still calls next()', async () => {
  const { requireRole: rr } = createAuth({ secret: SECRET });
  for (const guard of [requireAuth, rr(ROLE_ADMINISTRATOR)]) {
    const res = fakeRes();
    const next = spyNext();
    await guard(anyCast(fakeReq({ path: '/healthz' })), anyCast(res), anyCast(next.next));
    assert.equal(next.calls(), 1);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body, undefined);
  }
});

test('env-backed requireRole singleton enforces the role', async () => {
  // The default guards read the secret from JWT_SECRET on first use.
  delete process.env.JWT_SECRET_FILE;
  process.env.JWT_SECRET = new TextDecoder().decode(SECRET);
  const token = await sign({ roles: [ROLE_ADMINISTRATOR] });
  const res = fakeRes();
  const next = spyNext();
  await requireRole(ROLE_ADMINISTRATOR)(anyCast(fakeReq({ cookie: `access_token=${token}` })), anyCast(res), anyCast(next.next));
  assert.equal(next.calls(), 1);
  assert.deepEqual(res.locals.auth, { sub: 'person-1', roles: [ROLE_ADMINISTRATOR] });
});
