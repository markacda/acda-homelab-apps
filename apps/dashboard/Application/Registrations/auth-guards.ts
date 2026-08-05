import type { RequestHandler } from 'express';
import { createRoleGuards, ROLE_USER, type TokenVerifier } from '../../../Common/auth/index.ts';

// User gate for the Dashboard (issue #174). The shared @homelab/auth createRoleGuards
// factory provides both halves: an API gate (JSON 401/403 for /api/apps) and a page
// gate that redirects a logged-out browser to the auth login rather than handing it a
// JSON blob. The dashboard is served at the proxy ROOT ('/'), so appHome is '/'.

export interface DashboardGuards {
  /** Gate for the /api/* routers: JSON 401 (unauthenticated) / 403 (not a User). */
  requireApiUser: RequestHandler;
  /** Gate for the served shell: 302→login (unauthenticated) / 403 page (not a User). */
  requireUserPage: RequestHandler;
}

/**
 * Build the Dashboard guards. Passing an explicit `verify` or `secret` is for tests;
 * otherwise the shared HMAC secret is read from the environment (JWT_SECRET_FILE /
 * JWT_SECRET) lazily on first request, so importing this module never touches the env.
 */
export function createDashboardGuards(options: { verify?: TokenVerifier; secret?: Uint8Array } = {}): DashboardGuards {
  const { requireApi, requirePage } = createRoleGuards({
    role: ROLE_USER,
    appHome: '/',
    forbiddenMessage: 'Your account is signed in but is not allowed to view the dashboard.',
    ...options,
  });
  return { requireApiUser: requireApi, requireUserPage: requirePage };
}
