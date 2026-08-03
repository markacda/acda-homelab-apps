import type { CookieOptions, Request } from 'express';

// Cookie plumbing for the session tokens. Both tokens ride in Secure, httpOnly,
// SameSite cookies scoped to Path=/ (no Domain): every app sits behind the nginx
// proxy on one origin, so a root-path cookie is shared across all of them (SSO)
// without a shared parent domain — which a bare-IP/localhost host couldn't set
// anyway. `secure` is on by default; set COOKIE_SECURE=false for plain-http local dev.

export const ACCESS_COOKIE = 'access_token';
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

/** Parse a Cookie header into a name→value map (Express 5 doesn't parse cookies itself). */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (!name) continue;
    out[name] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

/** Read a single named cookie off the request, or undefined. */
export function readCookie(req: Request, name: string): string | undefined {
  return parseCookies(req.headers.cookie)[name];
}
