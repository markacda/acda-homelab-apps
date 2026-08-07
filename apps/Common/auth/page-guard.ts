import type { Request, RequestHandler, Response } from 'express';
import { createAuth } from './middleware.ts';
import { ACCESS_COOKIE, readCookie } from './cookies.ts';
import { joseVerifier, type TokenVerifier } from './verify.ts';
import { loadJwtSecret } from './secret.ts';
import { issueEmbedGrant, matchesEmbedToken, readEmbedGrant, verifyEmbedGrant } from './embed-grant.ts';

// A role gate for the apps that serve a browser frontend behind the nginx proxy
// (atc, recipe-book, log-viewer). Each needs the same pair of guards:
//   - an API gate (@homelab/auth's requireRole) that answers JSON 401/403, and
//   - a page gate that instead REDIRECTS a logged-out navigation to the auth login
//     (a JSON 401 blob is useless to a browser) and refuses to serve any content
//     otherwise — so an unauthenticated user can't retrieve the page at all.
// Previously each app hand-rolled both; this factory is the single source of truth.

/** The auth app's login path behind the proxy; a page guard bounces here when logged out. */
const DEFAULT_LOGIN_PATH = '/auth/';
/** Paths whose sub-tree the page guard leaves to the API gate (JSON 401, not a redirect). */
const DEFAULT_API_PUBLIC_PREFIXES = ['/api'];

export interface RoleGuardsOptions {
  /** The role a caller must hold (e.g. ROLE_USER, ROLE_ADMINISTRATOR). */
  role: string;
  /** This app's own public path behind the proxy (e.g. '/atc/'), used as the post-login return target. */
  appHome: string;
  /** The sentence shown under the 403 heading when a signed-in user lacks the role. */
  forbiddenMessage: string;
  /** Login path to bounce logged-out navigations to. Defaults to '/auth/'. */
  loginPath?: string;
  /** Path prefixes the page guard skips (guarded by the API gate instead). Defaults to ['/api']. */
  apiPublicPrefixes?: string[];
  /** Explicit verifier; overrides `secret`. For tests. */
  verify?: TokenVerifier;
  /** Explicit HMAC secret; ignored when `verify` is given. For tests. Defaults to loadJwtSecret(). */
  secret?: Uint8Array;
  /**
   * Shared token that lets this app be embedded without a user session (issue #186):
   * a request passing it as `?embed_token=…` is served and handed a short-lived signed
   * grant cookie so the rest of the embedded session works. Empty/unset disables the
   * embed path entirely, leaving the app fully gated.
   */
  embedToken?: string;
  /** Scope stamped on the embed grant so it can't authorize another app. Defaults to `appHome`. */
  embedScope?: string;
  /** Embed grant lifetime in ms once issued. Defaults to the embed-grant module default (24h). */
  embedGrantMaxAgeMs?: number;
}

export interface RoleGuards {
  /** Gate for the /api/* routers: JSON 401 (unauthenticated) / 403 (wrong role). */
  requireApi: RequestHandler;
  /** Gate for the served frontend: 302→login (unauthenticated) / 403 page (wrong role). */
  requirePage: RequestHandler;
}

/**
 * Build the API + page guards for a role-gated frontend app. Passing an explicit
 * `verify` or `secret` is for tests; otherwise the shared HMAC secret is read from
 * the environment (JWT_SECRET_FILE / JWT_SECRET) lazily on first request, so
 * importing this module never touches the env. The API and page guards share a
 * single lazily-resolved verifier.
 */
export function createRoleGuards(options: RoleGuardsOptions): RoleGuards {
  const loginPath = options.loginPath ?? DEFAULT_LOGIN_PATH;
  const apiPublicPrefixes = options.apiPublicPrefixes ?? DEFAULT_API_PUBLIC_PREFIXES;
  const embedToken = options.embedToken;
  const embedScope = options.embedScope ?? options.appHome;

  let secret: Uint8Array | undefined = options.secret;
  const resolveSecret = (): Uint8Array => {
    if (!secret) secret = loadJwtSecret();
    return secret;
  };
  let verifier: TokenVerifier | undefined = options.verify;
  const resolveVerifier = (): TokenVerifier => {
    if (!verifier) verifier = joseVerifier(resolveSecret());
    return verifier;
  };

  // Trusted-embed bypass (issue #186): a request carrying a valid grant cookie — or the
  // shared embed token, which is then handed a fresh grant — is allowed without a user
  // session. Inert unless an embed token is configured. Shared by both gates.
  const embedAllows = async (req: Request, res: Response): Promise<boolean> => {
    if (!embedToken) return false;
    const grant = readEmbedGrant(req);
    if (grant && (await verifyEmbedGrant(grant, resolveSecret(), embedScope))) return true;
    if (matchesEmbedToken(req, embedToken)) {
      await issueEmbedGrant(res, { secret: resolveSecret(), scope: embedScope, secure: req.secure, maxAgeMs: options.embedGrantMaxAgeMs });
      return true;
    }
    return false;
  };

  // The API gate reuses the shared middleware, sharing the very same verifier so
  // the secret is loaded once for both guards.
  const apiRoleGate = createAuth({ verify: (token) => resolveVerifier()(token) }).requireRole(options.role);
  const requireApi: RequestHandler = async (req, res, next) => {
    if (await embedAllows(req, res)) {
      next();
      return;
    }
    apiRoleGate(req, res, next);
  };

  const forbiddenHtml =
    '<!doctype html><meta charset="utf-8"><title>Forbidden</title>' +
    '<body style="font-family:system-ui;margin:4rem auto;max-width:32rem;text-align:center">' +
    `<h1>403 — ${options.role} role required</h1>` +
    `<p>${options.forbiddenMessage}</p></body>`;

  const requirePage: RequestHandler = async (req, res, next) => {
    // The API sub-trees are guarded by requireApi (JSON 401 — a 302 would break
    // <img>/fetch); the health endpoints stay public.
    if (req.path === '/healthz' || req.path === '/health' || apiPublicPrefixes.some((prefix) => req.path.startsWith(prefix))) {
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
    if (claims?.roles.includes(options.role)) {
      next();
      return;
    }
    if (await embedAllows(req, res)) {
      next();
      return;
    }
    if (!claims) {
      // Not signed in → bounce to the login page, returning here afterwards.
      res.redirect(302, `${loginPath}?redirect=${encodeURIComponent(options.appHome)}`);
      return;
    }
    // Signed in, but lacking the role.
    res.status(403).type('html').send(forbiddenHtml);
  };

  return { requireApi, requirePage };
}
