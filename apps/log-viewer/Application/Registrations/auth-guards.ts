import type { RequestHandler } from 'express';
import {
  createAuth,
  ROLE_ADMINISTRATOR,
  joseVerifier,
  loadJwtSecret,
  readCookie,
  ACCESS_COOKIE,
  type TokenVerifier,
} from '../../../Common/auth/index.ts';

// Administrator gate for LogViewer (issue #153). Two guards, because @homelab/auth's
// requireRole answers with JSON 401/403 and never redirects — fine for the API, but
// a logged-out browser hitting a page would just see a JSON blob. So the SPA shell
// gets its own guard that bounces unauthenticated navigations to the auth login and
// refuses to serve any content otherwise (an unauthenticated user must not be able
// to retrieve the page at all, even via dev-tools network inspection).

// Fixed proxy paths. The nginx proxy serves the auth app at /auth and this app at
// /logs, stripping the prefix before it reaches us — so the server can't know its
// own public path and hard-codes it here. The hash-routed view (#/exceptions, …) is
// never sent to the server anyway, so a logged-out page load returns to the app root;
// the client-side fetch guard (Web/client/app.ts) restores the exact view on later 401s.
const LOGIN = '/auth/';
const APP_HOME = '/logs/';

const FORBIDDEN_HTML =
  '<!doctype html><meta charset="utf-8"><title>Forbidden</title>' +
  '<body style="font-family:system-ui;margin:4rem auto;max-width:32rem;text-align:center">' +
  '<h1>403 — Administrator role required</h1>' +
  '<p>Your account is signed in but is not allowed to view the logs.</p></body>';

export interface LogViewerGuards {
  /** Gate for the /api/* routers: JSON 401 (unauthenticated) / 403 (not an Administrator). */
  requireApiAdmin: RequestHandler;
  /** Gate for the served SPA shell: 302→login (unauthenticated) / 403 page (not an Administrator). */
  requireAdminPage: RequestHandler;
}

/**
 * Build the LogViewer guards. Passing an explicit `verify` or `secret` is for tests;
 * otherwise the shared HMAC secret is read from the environment (JWT_SECRET_FILE /
 * JWT_SECRET) lazily on first request, so importing this module never touches the env.
 */
export function createLogViewerGuards(options: { verify?: TokenVerifier; secret?: Uint8Array } = {}): LogViewerGuards {
  const requireApiAdmin = createAuth(options).requireRole(ROLE_ADMINISTRATOR);

  let verifier: TokenVerifier | undefined = options.verify;
  const resolveVerifier = (): TokenVerifier => {
    if (!verifier) verifier = joseVerifier(options.secret ?? loadJwtSecret());
    return verifier;
  };

  const requireAdminPage: RequestHandler = async (req, res, next) => {
    // /api is guarded by requireApiAdmin; the health endpoints stay public.
    if (req.path === '/healthz' || req.path === '/health' || req.path.startsWith('/api')) {
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
    if (claims?.roles.includes(ROLE_ADMINISTRATOR)) {
      next();
      return;
    }
    if (!claims) {
      // Not signed in → bounce to the login page, returning here afterwards.
      res.redirect(302, `${LOGIN}?redirect=${encodeURIComponent(APP_HOME)}`);
      return;
    }
    // Signed in, but not an Administrator.
    res.status(403).type('html').send(FORBIDDEN_HTML);
  };

  return { requireApiAdmin, requireAdminPage };
}
