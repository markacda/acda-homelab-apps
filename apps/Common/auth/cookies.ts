import type { Request } from 'express';

// Cookie reading for the shared session tokens. The auth app sets them in Secure,
// httpOnly, SameSite=Lax cookies scoped to Path=/ (no Domain) so a single cookie
// is shared across every app behind the nginx proxy (SSO). Express 5 does not
// parse cookies itself, so — like the auth app — we hand-parse the Cookie header
// rather than depend on cookie-parser (which consuming apps don't mount either).

/** Name of the access-token cookie the auth app issues. */
export const ACCESS_COOKIE = 'access_token';

/** Parse a Cookie header into a name→value map. */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (!name) continue;
    const value = part.slice(eq + 1).trim();
    // The Cookie header is user-controlled; malformed %-encoding must not throw (DoS).
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

/** Read a single named cookie off the request, or undefined. */
export function readCookie(req: Request, name: string): string | undefined {
  return parseCookies(req.headers.cookie)[name];
}
