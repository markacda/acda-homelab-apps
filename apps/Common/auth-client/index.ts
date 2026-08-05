// @homelab/auth-client — shared browser-side auth helpers for the homelab frontends.
//
// The client-side counterpart of @homelab/auth: it removes the auth logic that was
// hand-copied across the browser clients (the "401 → /auth/ login" redirect guard,
// the `api/me` "who am I" call, and the JSON fetch helper). Compiled into each app's
// Web/public by that app's tsconfig.client.json (see CLAUDE.md — the client build now
// pins rootDir at the repo root so it can import this by relative `.ts` path).
//
// Browser-only: no Node types, DOM globals only. All app API URLs stay RELATIVE
// (`fetch('api/me')`, never `/api/me`) because the nginx proxy strips each app's path
// prefix before the request reaches it. Session cookies are httpOnly and set
// server-side, so this code never stores or reads a token itself.

/** The public "who am I" shape returned by `GET api/me` (mirror of the auth PersonView). */
export interface PersonView {
  id: string;
  email: string;
  roles: string[];
}

/** Role names, mirrored from @homelab/auth (ROLE_USER / ROLE_ADMINISTRATOR). */
export const ROLE_USER = 'User';
export const ROLE_ADMINISTRATOR = 'Administrator';

/** True when `me` holds `role`. */
export function hasRole(me: PersonView, role: string): boolean {
  return me.roles.includes(role);
}

// ---- login redirect -------------------------------------------------------

/**
 * Restrict a post-login redirect target to a same-origin root-relative path, so a
 * crafted `?redirect=` can't bounce the user off to another site (`//evil.com`,
 * `/\evil.com`) or a `javascript:` URL. Anything else falls back to the dashboard root.
 * Pure (no DOM) — the login page passes it `?redirect=` and unit tests cover it.
 */
export function safeRedirect(raw: string | null): string {
  if (raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\')) return raw;
  return '/';
}

/** Build the auth login URL that returns to `here` afterwards. Pure (no DOM). */
export function buildLoginRedirectUrl(here: string): string {
  return `/auth/?redirect=${encodeURIComponent(here)}`;
}

let redirecting = false;

/**
 * Navigate to the auth login page, returning to the current view afterwards. The
 * browser knows our true prefixed path (which the prefix-stripping proxy hides from
 * the server), so the round-trip target is precise. Idempotent: the first call wins
 * and the navigation is underway, so callers should not proceed after it.
 */
export function redirectToLogin(): void {
  if (redirecting) return;
  redirecting = true;
  const here = location.pathname + location.search + location.hash;
  location.assign(buildLoginRedirectUrl(here));
}

/** True when `input` targets our own origin (relative URLs included). */
function isSameOrigin(input: RequestInfo | URL): boolean {
  try {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return new URL(url, location.href).origin === location.origin;
  } catch {
    // A malformed/opaque input — treat as same-origin so we don't miss a real 401.
    return true;
  }
}

let installed = false;

/**
 * Wrap `window.fetch` once so any **same-origin** 401 bounces the user to the login
 * page. This is the single mechanism the API-consuming apps (recipe-book, log-viewer,
 * atc) use to handle a session that expires while the page is open. The same-origin
 * guard means a cross-origin 401 (e.g. a third-party map/route API) never triggers a
 * redirect. Idempotent — a second call is a no-op.
 */
export function installAuthRedirect(): void {
  if (installed) return;
  installed = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const res = await originalFetch(input, init);
    if (res.status === 401 && isSameOrigin(input)) redirectToLogin();
    return res;
  };
}

// ---- fetch helpers --------------------------------------------------------

/**
 * Fetch the signed-in user via `GET api/me`, or `null` when signed out (401) or the
 * request fails. Bypasses the redirect guard's intent by design: the auth pages call
 * this to *decide* what to show for a logged-out visitor, so a 401 must resolve to
 * `null` rather than navigate. (The auth pages don't install `installAuthRedirect`.)
 */
export async function fetchCurrentUser(): Promise<PersonView | null> {
  try {
    const res = await fetch('api/me');
    if (!res.ok) return null;
    return (await res.json()) as PersonView;
  } catch {
    return null;
  }
}

/**
 * End the current session via the auth app's `POST /auth/api/logout`. The path is
 * ABSOLUTE (like `buildLoginRedirectUrl`'s `/auth/`) because the logout button may
 * live on any app behind the proxy — e.g. the dashboard at '/', where a relative
 * 'api/logout' would hit the dashboard's own server and 404. The session cookies are
 * httpOnly and Path=/ (shared across every app), so the auth server invalidates the
 * refresh session and clears both cookies (returning 204). Callers reload/redirect
 * afterwards.
 */
export async function logout(): Promise<void> {
  await apiJson('/auth/api/logout', { method: 'POST' });
}

/**
 * JSON API call that returns the parsed body and throws the server's `{ error }`
 * message on a non-2xx response. Sends `Content-Type: application/json` only when
 * there's a body; a 204 resolves to `undefined`. Cookies are same-origin, so the
 * session cookie is sent automatically. This helper does not itself redirect on 401
 * — apps that want that install `installAuthRedirect` (its fetch wrapper covers the
 * call made here); the auth login/users pages deliberately surface the 401 inline.
 */
export async function apiJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json', ...options.headers } : options.headers,
  });
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data as T;
}
