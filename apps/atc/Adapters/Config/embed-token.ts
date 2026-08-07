import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

// Self-provision the Home Assistant embed token (issue #186), mirroring the auth app's
// JWT_SECRET_FILE convention: ATC_EMBED_TOKEN_FILE points at a path on a persistent
// volume (the Dockerfile sets it), so the first boot generates a token and writes it
// there and every later boot reads the same value back — the HA card URL keeps working
// across redeploys without anyone exporting a secret by hand. ATC_EMBED_TOKEN pins the
// value explicitly instead. With neither set (local dev, tests) there is no token and
// the embed bypass stays off, leaving ATC fully gated.

const TOKEN_BYTES = 32;

/**
 * The shared embed token: an explicit ATC_EMBED_TOKEN, else the one persisted at
 * ATC_EMBED_TOKEN_FILE — generated (0600) on first use. Undefined when neither is
 * configured, which disables the embed bypass.
 */
export function loadOrCreateEmbedToken(): string | undefined {
  const inline = process.env.ATC_EMBED_TOKEN?.trim();
  if (inline) return inline;

  const file = process.env.ATC_EMBED_TOKEN_FILE?.trim();
  if (!file) return undefined;

  if (existsSync(file)) {
    const existing = readFileSync(file, 'utf8').trim();
    if (existing) return existing;
  }

  const token = randomBytes(TOKEN_BYTES).toString('hex');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, token, { mode: 0o600 });
  return token;
}
