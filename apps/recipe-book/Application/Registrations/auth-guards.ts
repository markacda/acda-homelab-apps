import type { RequestHandler } from 'express';
import { createAuth, ROLE_USER, joseVerifier, loadJwtSecret, readCookie, ACCESS_COOKIE, type TokenVerifier } from '../../../Common/auth/index.ts';

// User gate for Receptenboek (issue #154). Two guards, because @homelab/auth's
// requireRole answers with JSON 401/403 and never redirects — fine for /api and the
// /images sub-resources, but a logged-out browser hitting a page would just see a
// JSON blob. So the served SPA shell gets its own guard that bounces unauthenticated
// navigations to the auth login and refuses to serve any content otherwise (an
// unauthenticated user must not be able to retrieve the page at all).

// Fixed proxy paths. The nginx proxy serves the auth app at /auth and this app at
// /receptenboek, stripping the prefix before it reaches us — so the server can't
// know its own public path and hard-codes it here. The client's own 401 handler
// (Web/client/app.ts) preserves the exact URL on later 401s.
const LOGIN = '/auth/';
const APP_HOME = '/receptenboek/';

const FORBIDDEN_HTML =
  '<!doctype html><meta charset="utf-8"><title>Forbidden</title>' +
  '<body style="font-family:system-ui;margin:4rem auto;max-width:32rem;text-align:center">' +
  '<h1>403 — User role required</h1>' +
  '<p>Your account is signed in but is not allowed to view the recipe book.</p></body>';

export interface RecipeBookGuards {
  /** Gate for the /api/* + /images sub-resources: JSON 401 (unauthenticated) / 403 (not a User). */
  requireApiUser: RequestHandler;
  /** Gate for the served SPA shell: 302→login (unauthenticated) / 403 page (not a User). */
  requireUserPage: RequestHandler;
}

/**
 * Build the Receptenboek guards. Passing an explicit `verify` or `secret` is for
 * tests; otherwise the shared HMAC secret is read from the environment
 * (JWT_SECRET_FILE / JWT_SECRET) lazily on first request, so importing this module
 * never touches the env.
 */
export function createRecipeBookGuards(options: { verify?: TokenVerifier; secret?: Uint8Array } = {}): RecipeBookGuards {
  const requireApiUser = createAuth(options).requireRole(ROLE_USER);

  let verifier: TokenVerifier | undefined = options.verify;
  const resolveVerifier = (): TokenVerifier => {
    if (!verifier) verifier = joseVerifier(options.secret ?? loadJwtSecret());
    return verifier;
  };

  const requireUserPage: RequestHandler = async (req, res, next) => {
    // /api and /images are guarded by requireApiUser (JSON 401 — a 302 would break
    // <img> loads); the health endpoints stay public.
    if (req.path === '/healthz' || req.path === '/health' || req.path.startsWith('/api') || req.path.startsWith('/images')) {
      next();
      return;
    }
    const token = readCookie(req, ACCESS_COOKIE);
    let claims = null;
    if (token) {
      try {
        claims = await resolveVerifier()(token);
      } catch {
        claims = null;
      }
    }
    if (claims?.roles.includes(ROLE_USER)) {
      next();
      return;
    }
    if (!claims) {
      // Not signed in → bounce to the login page, returning here afterwards.
      res.redirect(302, `${LOGIN}?redirect=${encodeURIComponent(APP_HOME)}`);
      return;
    }
    // Signed in, but not a User.
    res.status(403).type('html').send(FORBIDDEN_HTML);
  };

  return { requireApiUser, requireUserPage };
}
