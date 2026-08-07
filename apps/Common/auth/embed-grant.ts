import type { Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { readCookie } from './cookies.ts';

// Trusted-embed grant for a frontend app served without the user's session cookie —
// e.g. ATC shown inside a Home Assistant iframe (issue #186). HA and the app are the
// SAME site (same scheme + host, only the port differs), so a normal SameSite=Lax
// cookie the app sets rides along on every request the iframe makes. The flow:
//   1. The first (iframe) request carries the shared token as ?embed_token=… but has
//      no valid session cookie → the guard issues a short-lived signed grant.
//   2. Every later asset/API request from the iframe carries that cookie → allowed.
// Anything without the token and without a grant stays gated. The grant is an HS256
// JWT (same shared secret as access tokens) scoped to one app, so an ATC grant can't
// authorize another app.
//
// The token has to travel in the URL because nothing else about an embedded request is
// trustworthy or even present: HA's Webpage card exposes no referrerpolicy knob, a plain
// GET navigation never sends Origin, and Chrome's default strict-origin-when-cross-origin
// drops the Referer entirely on an HTTPS→HTTP downgrade — so header-based origin checks
// silently never match. The cost is that the token lands in this app's access log and in
// the HA dashboard config (both already privileged), which is acceptable for this
// low-sensitivity, opt-in-per-app view.

const ALG = 'HS256';

/** Name of the trusted-embed grant cookie. */
export const EMBED_COOKIE = 'embed_grant';

/** Query parameter carrying the shared embed token. */
export const EMBED_TOKEN_PARAM = 'embed_token';

/** Grant lifetime once issued, unless overridden. */
export const DEFAULT_EMBED_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Constant-time string compare, so a wrong token can't be guessed byte-by-byte. */
function secretEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Whether the request carries the shared embed token as `?embed_token=…`. An
 * unset/empty `expected` disables the check.
 */
export function matchesEmbedToken(req: Request, expected: string | undefined): boolean {
  if (!expected) return false;
  const provided = (req.query as Record<string, unknown> | undefined)?.[EMBED_TOKEN_PARAM];
  return typeof provided === 'string' && secretEquals(provided, expected);
}

/** Sign a scoped grant and set it as the embed cookie. `secure` should mirror the request scheme. */
export async function issueEmbedGrant(
  res: Response,
  options: { secret: Uint8Array; scope: string; secure: boolean; maxAgeMs?: number }
): Promise<void> {
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_EMBED_MAX_AGE_MS;
  const expSeconds = Math.floor(Date.now() / 1000) + Math.floor(maxAgeMs / 1000);
  const token = await new SignJWT({ embed: options.scope })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(expSeconds)
    .sign(options.secret);
  res.cookie(EMBED_COOKIE, token, { httpOnly: true, secure: options.secure, sameSite: 'lax', path: '/', maxAge: maxAgeMs });
}

/** Verify a grant token: valid HS256 signature, unexpired, and scoped to `scope`. */
export async function verifyEmbedGrant(token: string, secret: Uint8Array, scope: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: [ALG] });
    return (payload as { embed?: unknown }).embed === scope;
  } catch {
    return false;
  }
}

/** Read the embed grant token off the request, or undefined. */
export function readEmbedGrant(req: Request): string | undefined {
  return readCookie(req, EMBED_COOKIE);
}
