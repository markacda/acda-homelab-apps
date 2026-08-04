import type { RequestHandler } from 'express';
import { ACCESS_COOKIE, readCookie } from './cookies.ts';
import { loadJwtSecret } from './secret.ts';
import { joseVerifier, type AuthClaims, type TokenVerifier } from './verify.ts';

// The shared route guards. Unlike the auth app's authenticate() filter — which
// throws and relies on that app's error-mapping filter — these respond DIRECTLY,
// because consuming apps (log-viewer, atc) have no such filter and server-kit's
// terminal handler only emits 500s. The contract:
//   - no cookie / invalid / expired token → 401 { error: 'unauthorized' }
//   - authenticated but lacking the role   → 403 { error: 'forbidden' }
// Verified claims are stashed on res.locals.auth (the repo convention; no Express
// Request augmentation). Both guards leave the health endpoints public so an
// app-wide `app.use(requireRole(...))` never gates the container healthcheck.

const DEFAULT_PUBLIC_PATHS = ['/healthz', '/health'];

export interface AuthOptions {
  /** Verifier to use. Overrides `secret`; defaults to a jose HS256 verifier from `secret`/env. */
  verify?: TokenVerifier;
  /** Shared HMAC secret bytes. Ignored when `verify` is given; defaults to loadJwtSecret(). */
  secret?: Uint8Array;
  /** Cookie the access token rides in. Defaults to 'access_token'. */
  cookieName?: string;
  /** Paths left unauthenticated. Defaults to ['/healthz', '/health']. */
  publicPaths?: string[];
}

export interface AuthMiddleware {
  /** Guard requiring a valid access token; 401 otherwise. */
  requireAuth: RequestHandler;
  /** Guard requiring a valid token AND at least one of the given roles; 401/403 otherwise. */
  requireRole: (...roles: string[]) => RequestHandler;
}

// Distinguishes "public path, skip auth" from "authenticated with these claims".
const SKIP = Symbol('auth:skip');

/**
 * Build the `requireAuth` / `requireRole` guards. The verifier is resolved lazily
 * — passing an explicit `verify` or `secret` is ideal for tests; otherwise the
 * shared secret is read from the environment (JWT_SECRET_FILE / JWT_SECRET) on
 * first use, so importing this module never requires the env to be set.
 */
export function createAuth(options: AuthOptions = {}): AuthMiddleware {
  const cookieName = options.cookieName ?? ACCESS_COOKIE;
  const publicPaths = options.publicPaths ?? DEFAULT_PUBLIC_PATHS;

  let verifier: TokenVerifier | undefined = options.verify;
  const resolveVerifier = (): TokenVerifier => {
    if (!verifier) verifier = joseVerifier(options.secret ?? loadJwtSecret());
    return verifier;
  };

  // Authenticate a request: return SKIP for a public path, the claims on success,
  // or null after having already sent a 401. Never throws to the caller.
  const authenticate = async (req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]): Promise<AuthClaims | typeof SKIP | null> => {
    if (publicPaths.includes(req.path)) return SKIP;
    const token = readCookie(req, cookieName);
    if (!token) {
      res.status(401).json({ error: 'unauthorized' });
      return null;
    }
    try {
      const claims = await resolveVerifier()(token);
      res.locals.auth = claims;
      return claims;
    } catch {
      res.status(401).json({ error: 'unauthorized' });
      return null;
    }
  };

  const requireAuth: RequestHandler = async (req, res, next) => {
    const result = await authenticate(req, res);
    if (result !== null) next();
  };

  const requireRole =
    (...roles: string[]): RequestHandler =>
    async (req, res, next) => {
      const result = await authenticate(req, res);
      if (result === null) return; // 401 already sent
      if (result === SKIP) {
        next();
        return;
      }
      if (roles.length && !roles.some((role) => result.roles.includes(role))) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }
      next();
    };

  return { requireAuth, requireRole };
}
