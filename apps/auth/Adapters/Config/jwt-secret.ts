import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { SECRET_BYTES, decodeSecretFile } from '../../../Common/auth/secret.ts';

// Self-provision the JWT signing secret, mirroring the DATABASE_URL_FILE convention
// in @homelab/db: point JWT_SECRET_FILE at a path on a persistent volume; on first
// boot we generate a 256-bit secret and write it there (0600), and every later boot
// reads the same value back — so redeploys keep existing sessions valid. For local
// dev/tests, an inline JWT_SECRET is honored when no file path is configured. The
// decode/length-check is shared with @homelab/auth's read-only loadJwtSecret so the
// signer and the verifiers agree on the encoding.

/** Resolve the HMAC signing secret as raw bytes, generating+persisting it if needed. */
export function loadOrCreateJwtSecret(): Uint8Array {
  const file = process.env.JWT_SECRET_FILE;
  if (file) {
    if (existsSync(file)) {
      const contents = readFileSync(file, 'utf8').trim();
      if (contents) return decodeSecretFile(contents, file);
    }
    const secret = randomBytes(SECRET_BYTES);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, secret.toString('base64'), { mode: 0o600 });
    return secret;
  }

  const inline = process.env.JWT_SECRET;
  if (inline && inline.trim()) return new TextEncoder().encode(inline.trim());

  throw new Error('No JWT secret configured: set JWT_SECRET_FILE (persisted) or JWT_SECRET (inline).');
}
