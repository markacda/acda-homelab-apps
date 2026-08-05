import type { RequestHandler } from 'express';
import { createRoleGuards, ROLE_USER, type TokenVerifier } from '../../../Common/auth/index.ts';

// User gate for Notificaties (issue #174). The shared @homelab/auth createRoleGuards
// factory provides both halves: an API gate (JSON 401/403) and a page gate that
// redirects a logged-out browser to the auth login rather than handing it a JSON blob.
//
// The container-to-container `POST /send` endpoint (used by e.g. log-viewer alerts)
// keeps its own SEND_TOKEN bearer check and must NOT be JWT-User-gated — so it is
// listed as a public prefix here (the page guard skips it) and the /api gate is only
// mounted on /api (never on /send). Only the feed (`GET /api/notifications`) and the
// served frontend are User-gated.

export interface NotificationGuards {
  /** Gate for the /api/* routers (the feed): JSON 401 (unauthenticated) / 403 (not a User). */
  requireApiUser: RequestHandler;
  /** Gate for the served frontend: 302→login (unauthenticated) / 403 page (not a User). */
  requireUserPage: RequestHandler;
}

/**
 * Build the Notificaties guards. Passing an explicit `verify` or `secret` is for tests;
 * otherwise the shared HMAC secret is read from the environment (JWT_SECRET_FILE /
 * JWT_SECRET) lazily on first request, so importing this module never touches the env.
 */
export function createNotificationGuards(options: { verify?: TokenVerifier; secret?: Uint8Array } = {}): NotificationGuards {
  const { requireApi, requirePage } = createRoleGuards({
    role: ROLE_USER,
    appHome: '/notificaties/',
    forbiddenMessage: 'Your account is signed in but is not allowed to view notifications.',
    // Leave /send to its own SEND_TOKEN check (container-to-container); the page guard
    // must not 302-redirect that POST. /api is gated by requireApiUser below.
    apiPublicPrefixes: ['/api', '/send'],
    ...options,
  });
  return { requireApiUser: requireApi, requireUserPage: requirePage };
}
