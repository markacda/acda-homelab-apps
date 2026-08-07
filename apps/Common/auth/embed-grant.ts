import type { Request, Response } from 'express';
import { SignJWT, jwtVerify } from 'jose';
import { readCookie } from './cookies.ts';

// Trusted-embed grant for a frontend app served without the user's session cookie —
// e.g. ATC shown inside a Home Assistant iframe (issue #186). HA and the app are the
// SAME site (same scheme + host, only the port differs), so a normal SameSite=Lax
// cookie the app sets rides along on every request the iframe makes. The flow:
//   1. The first (iframe) request carries a Referer/Origin of the trusted HA origin
//      but no valid session cookie → the guard issues a short-lived signed grant.
//   2. Every later asset/API request from the iframe carries that cookie → allowed.
// A direct visit from any other origin has no trusted Referer and no grant, so it
// stays gated. The grant is an HS256 JWT (same shared secret as access tokens) scoped
// to one app, so an ATC grant can't authorize another app.
//
// Trade-off: a non-browser client could forge the Referer to obtain a grant. Browsers
// cannot forge a cross-origin Referer, so real browser traffic from other origins
// stays gated — acceptable for this low-sensitivity, opt-in-per-app view.

const ALG = 'HS256';

/** Name of the trusted-embed grant cookie. */
export const EMBED_COOKIE = 'embed_grant';

/** Grant lifetime once issued, unless overridden. */
export const DEFAULT_EMBED_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** The origin (scheme//host[:port]) of a URL string, or undefined if unparseable. */
function originOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

/**
 * Whether the request comes from one of the trusted embed origins: the `Origin`
 * header when present, else the origin of the `Referer`. Comparison is
 * case-insensitive; an empty list disables the check.
 */
export function matchesTrustedOrigin(req: Request, trustedOrigins: string[]): boolean {
  if (trustedOrigins.length === 0) return false;
  const requestOrigin = originOf(req.get('origin')) ?? originOf(req.get('referer'));
  if (requestOrigin === undefined) return false;
  const wanted = requestOrigin.toLowerCase();
  return trustedOrigins.some((o) => o.toLowerCase() === wanted);
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
