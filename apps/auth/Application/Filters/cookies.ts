import type { CookieOptions } from 'express';

// Cookie plumbing for the session tokens. Both tokens ride in Secure, httpOnly,
// SameSite cookies scoped to Path=/ (no Domain): every app sits behind the nginx
// proxy on one origin, so a root-path cookie is shared across all of them (SSO)
// without a shared parent domain — which a bare-IP/localhost host couldn't set
// anyway. `secure` is on by default; set COOKIE_SECURE=false for plain-http local dev.
//
// The READ side (ACCESS_COOKIE + parseCookies/readCookie) lives in @homelab/auth so
// the issuer here and every verifying app agree on the cookie name and parsing; this
// file owns only the WRITE side (the refresh cookie name + cookie option builders).

// Re-exported so this module stays the auth app's single cookie import surface.
export { ACCESS_COOKIE, parseCookies, readCookie } from '../../../Common/auth/index.ts';

export const REFRESH_COOKIE = 'refresh_token';

/** Access-token cookie lifetime: 7 days (matches the JWT validity). */
export const ACCESS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Refresh-token cookie lifetime: 30 days. */
export const REFRESH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function secureCookies(): boolean {
  return process.env.COOKIE_SECURE !== 'false';
}

/** Options for a session cookie with the given lifetime. */
export function sessionCookieOptions(maxAgeMs: number): CookieOptions {
  return { httpOnly: true, secure: secureCookies(), sameSite: 'lax', path: '/', maxAge: maxAgeMs };
}

/** Options used to clear a session cookie (path/secure/sameSite must match to delete). */
export function clearCookieOptions(): CookieOptions {
  return { httpOnly: true, secure: secureCookies(), sameSite: 'lax', path: '/' };
}
