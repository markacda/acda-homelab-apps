import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadOrCreateEmbedToken } from '../Adapters/Config/embed-token.ts';

// The self-provisioned Home Assistant embed token (issue #186): generated once onto a
// persistent volume and read back on every later boot, so the URL configured in the HA
// Webpage card keeps working across redeploys.

/** Run `fn` with only the given embed env vars set, restoring the environment after. */
function withEnv<T>(env: { ATC_EMBED_TOKEN?: string; ATC_EMBED_TOKEN_FILE?: string }, fn: () => T): T {
  const before = { ATC_EMBED_TOKEN: process.env.ATC_EMBED_TOKEN, ATC_EMBED_TOKEN_FILE: process.env.ATC_EMBED_TOKEN_FILE };
  delete process.env.ATC_EMBED_TOKEN;
  delete process.env.ATC_EMBED_TOKEN_FILE;
  if (env.ATC_EMBED_TOKEN !== undefined) process.env.ATC_EMBED_TOKEN = env.ATC_EMBED_TOKEN;
  if (env.ATC_EMBED_TOKEN_FILE !== undefined) process.env.ATC_EMBED_TOKEN_FILE = env.ATC_EMBED_TOKEN_FILE;
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

/** A throwaway stand-in for the mounted secrets volume. */
function tempTokenFile(t: { after: (fn: () => void) => void }): string {
  const dir = mkdtempSync(join(tmpdir(), 'atc-embed-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, 'embed-token');
}

test('generates a token and persists it when the file does not exist yet', (t) => {
  const file = tempTokenFile(t);
  const token = withEnv({ ATC_EMBED_TOKEN_FILE: file }, loadOrCreateEmbedToken);
  assert.match(token ?? '', /^[0-9a-f]{64}$/);
  assert.equal(readFileSync(file, 'utf8'), token);
});

test('reads the same token back on a later boot', (t) => {
  const file = tempTokenFile(t);
  const first = withEnv({ ATC_EMBED_TOKEN_FILE: file }, loadOrCreateEmbedToken);
  const second = withEnv({ ATC_EMBED_TOKEN_FILE: file }, loadOrCreateEmbedToken);
  assert.equal(second, first);
});

test('regenerates when the persisted file is empty', (t) => {
  const file = tempTokenFile(t);
  writeFileSync(file, '   \n');
  const token = withEnv({ ATC_EMBED_TOKEN_FILE: file }, loadOrCreateEmbedToken);
  assert.match(token ?? '', /^[0-9a-f]{64}$/);
});

test('an explicit ATC_EMBED_TOKEN wins and writes nothing', (t) => {
  const file = tempTokenFile(t);
  const token = withEnv({ ATC_EMBED_TOKEN: ' pinned-token ', ATC_EMBED_TOKEN_FILE: file }, loadOrCreateEmbedToken);
  assert.equal(token, 'pinned-token');
  assert.throws(() => readFileSync(file, 'utf8'));
});

test('unconfigured — no token, so the embed bypass stays off', () => {
  assert.equal(
    withEnv({}, loadOrCreateEmbedToken),
    undefined,
    'neither ATC_EMBED_TOKEN nor ATC_EMBED_TOKEN_FILE set should leave the bypass disabled'
  );
  assert.equal(withEnv({ ATC_EMBED_TOKEN: '  ' }, loadOrCreateEmbedToken), undefined);
});
