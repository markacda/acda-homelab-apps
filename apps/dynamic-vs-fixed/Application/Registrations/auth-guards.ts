import type { RequestHandler } from 'express';
import { createRoleGuards, ROLE_USER, type TokenVerifier } from '../../../Common/auth/index.ts';

// User gate for Dynamisch-of-vast (issue #174). The shared @homelab/auth
// createRoleGuards factory provides both halves: an API gate (JSON 401/403) and a
// page gate that redirects a logged-out browser to the auth login rather than handing
// it a JSON blob. This file just supplies this app's specifics (role, proxy home
// path, 403 wording).

export interface DynamicVsFixedGuards {
  /** Gate for the /api/* routers: JSON 401 (unauthenticated) / 403 (not a User). */
  requireApiUser: RequestHandler;
  /** Gate for the served static frontend: 302→login (unauthenticated) / 403 page (not a User). */
  requireUserPage: RequestHandler;
}

/**
 * Build the Dynamisch-of-vast guards. Passing an explicit `verify` or `secret` is for
 * tests; otherwise the shared HMAC secret is read from the environment (JWT_SECRET_FILE /
 * JWT_SECRET) lazily on first request, so importing this module never touches the env.
 */
export function createDynamicVsFixedGuards(options: { verify?: TokenVerifier; secret?: Uint8Array } = {}): DynamicVsFixedGuards {
  const { requireApi, requirePage } = createRoleGuards({
    role: ROLE_USER,
    appHome: '/dynamisch-of-vast/',
    forbiddenMessage: 'Your account is signed in but is not allowed to view this app.',
    ...options,
  });
  return { requireApiUser: requireApi, requireUserPage: requirePage };
}
