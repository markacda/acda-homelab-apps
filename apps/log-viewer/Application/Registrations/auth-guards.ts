import type { RequestHandler } from 'express';
import { createRoleGuards, ROLE_ADMINISTRATOR, type TokenVerifier } from '../../../Common/auth/index.ts';

// Administrator gate for LogViewer (issue #153). The shared @homelab/auth
// createRoleGuards factory provides both halves: an API gate (JSON 401/403) and a
// page gate that redirects a logged-out browser to the auth login rather than handing
// it a JSON blob. This file just supplies LogViewer's specifics (role, proxy home
// path, 403 wording). The hash-routed views (#/exceptions, …) never reach the server,
// so a logged-out page load returns to the app root and the client restores the view.

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
  const { requireApi, requirePage } = createRoleGuards({
    role: ROLE_ADMINISTRATOR,
    appHome: '/logs/',
    forbiddenMessage: 'Your account is signed in but is not allowed to view the logs.',
    ...options,
  });
  return { requireApiAdmin: requireApi, requireAdminPage: requirePage };
}
