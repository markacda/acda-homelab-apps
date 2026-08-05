import { existsSync, readFileSync } from 'node:fs';

// Resolve the HMAC secret used to VERIFY access tokens. The auth app's
// loadOrCreateJwtSecret (apps/auth/Adapters/Config/jwt-secret.ts) shares this
// module's decodeSecretFile; this reader is deliberately READ-ONLY: a consuming
// app must verify with the exact same secret
// the auth app signs with, so it reads the shared secret and never generates one
// (self-generating here would mint a divergent key and every token would fail to
// verify). Point JWT_SECRET_FILE at the same persisted key the auth app writes,
// or share the inline JWT_SECRET. The encoding must match the auth app exactly:
// a file holds the base64 of the raw bytes; an inline value is used as UTF-8.

export const SECRET_BYTES = 32;

/**
 * Decode a base64 secret-file's contents into raw bytes, failing loud if it's too
 * short. Shared with the auth app's loadOrCreateJwtSecret so the reader and the
 * writer agree on the encoding and the length invariant. `Buffer.from(..,'base64')`
 * silently drops non-base64 chars, so corrupt or truncated material decodes short —
 * we reject it rather than sign/verify with a weak key.
 */
export function decodeSecretFile(contents: string, file: string): Uint8Array {
  const secret = Buffer.from(contents, 'base64');
  if (secret.length < SECRET_BYTES) {
    throw new Error(`JWT secret in ${file} is invalid or too short (${secret.length} bytes decoded, need >= ${SECRET_BYTES}).`);
  }
  return secret;
}

/** Resolve the HMAC verifying secret as raw bytes. Throws if none is configured. */
export function loadJwtSecret(): Uint8Array {
  const file = process.env.JWT_SECRET_FILE;
  if (file && existsSync(file)) {
    const contents = readFileSync(file, 'utf8').trim();
    if (contents) return decodeSecretFile(contents, file);
  }

  const inline = process.env.JWT_SECRET;
  if (inline && inline.trim()) return new TextEncoder().encode(inline.trim());

  throw new Error('No JWT secret configured: set JWT_SECRET_FILE (the auth app’s persisted key) or JWT_SECRET (inline).');
}
