import type { RequestHandler } from 'express';
import { createAuth, type AuthMiddleware } from './middleware.ts';

// Public surface of @homelab/auth. Consuming apps import this by relative path
// (e.g. `import { requireRole } from '../Common/auth/index.ts'`) and compile it
// into their own dist/, adding `jose` to their own runtime dependencies and
// staging `COPY apps/Common/auth/...` in their Dockerfile builder.

export { createAuth } from './middleware.ts';
export type { AuthMiddleware, AuthOptions } from './middleware.ts';
export type { AuthClaims, TokenVerifier } from './verify.ts';
export { joseVerifier } from './verify.ts';
export { loadJwtSecret } from './secret.ts';
export { ACCESS_COOKIE, parseCookies, readCookie } from './cookies.ts';

/** The two roles the auth app models. New accounts default to ROLE_USER. */
export const ROLE_USER = 'User';
export const ROLE_ADMINISTRATOR = 'Administrator';

// Env-backed default guards, so the common case needs no factory wiring:
//   router.get('/x', requireRole(ROLE_ADMINISTRATOR), handler)  // per-endpoint
//   app.use(requireRole(ROLE_USER))                             // app-wide
// The default instance (and its secret, read from JWT_SECRET_FILE / JWT_SECRET)
// is built once on first request — importing this module never touches the env.
let defaultInstance: AuthMiddleware | undefined;
function shared(): AuthMiddleware {
  if (!defaultInstance) defaultInstance = createAuth();
  return defaultInstance;
}

/** Guard requiring a valid access token (env-configured secret); 401 otherwise. */
export const requireAuth: RequestHandler = (req, res, next) => shared().requireAuth(req, res, next);

/** Guard requiring a valid token AND one of the given roles (env-configured secret); 401/403 otherwise. */
export function requireRole(...roles: string[]): RequestHandler {
  return (req, res, next) => shared().requireRole(...roles)(req, res, next);
}
