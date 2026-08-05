import type { RequestHandler } from 'express';
import { createRoleGuards, ROLE_USER, type TokenVerifier } from '../../../Common/auth/index.ts';

// User gate for Receptenboek (issue #154). The shared @homelab/auth createRoleGuards
// factory provides both halves: an API gate (JSON 401/403, also covering the /images
// sub-resources so a 302 can't break <img> loads) and a page gate that redirects a
// logged-out browser to the auth login rather than handing it a JSON blob. This file
// just supplies Receptenboek's specifics (role, proxy home path, extra public prefix).

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
  const { requireApi, requirePage } = createRoleGuards({
    role: ROLE_USER,
    appHome: '/receptenboek/',
    forbiddenMessage: 'Your account is signed in but is not allowed to view the recipe book.',
    apiPublicPrefixes: ['/api', '/images'],
    ...options,
  });
  return { requireApiUser: requireApi, requireUserPage: requirePage };
}
