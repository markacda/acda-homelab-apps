# @homelab/auth-client

Shared **browser-side** auth helpers — the client-side counterpart of
[`@homelab/auth`](../auth). It removes the auth logic that was hand-copied across the
frontends (with "mirror (not import)" comments) into one canonical place.

Browser-only (DOM globals, no Node types). Imported by relative `.ts` path from an app's
`Web/client` code and compiled into that app's `Web/public` by its `tsconfig.client.json`
(which pins `rootDir` at the repo root so the shared source is reachable — see the root
`CLAUDE.md` build model). All API URLs stay **relative** (`fetch('api/me')`), since the
nginx proxy strips each app's path prefix.

## Exports

- `PersonView` — the `{ id, email, roles }` shape returned by `GET api/me`.
- `ROLE_USER`, `ROLE_ADMINISTRATOR`, `hasRole(me, role)` — role names + membership check.
- `safeRedirect(raw)` — allow-list an incoming `?redirect=` to a same-origin
  root-relative path (rejects `//evil.com`, `/\evil.com`, `javascript:`). Pure.
- `buildLoginRedirectUrl(here)` — build `/auth/?redirect=<here>`. Pure.
- `redirectToLogin()` — navigate to the login page, returning to the current view after
  sign-in. Idempotent.
- `installAuthRedirect()` — wrap `window.fetch` once so a **same-origin** 401 triggers
  `redirectToLogin()`. The single "session expired" mechanism for the API-consuming apps
  (recipe-book, log-viewer, atc). Cross-origin 401s are ignored. Idempotent.
- `fetchCurrentUser()` — `GET api/me` → `PersonView | null` (null when signed out). Used
  by the auth pages to decide what to show a logged-out visitor.
- `apiJson<T>(path, options?)` — JSON fetch that throws the server's `{ error }` on a
  non-2xx (204 → `undefined`). Does **not** itself redirect on 401 — apps that want that
  install `installAuthRedirect`; the login/users pages surface the 401 inline.

## Usage

```ts
// An API-consuming app (recipe-book / log-viewer / atc):
import { installAuthRedirect, apiJson } from '../../../Common/auth-client/index.ts';
installAuthRedirect(); // a session that expires mid-page bounces to /auth/

// The auth pages (no guard — a 401 means "signed out", handled inline):
import { fetchCurrentUser, hasRole, ROLE_ADMINISTRATOR } from '../../../Common/auth-client/index.ts';
const me = await fetchCurrentUser();
if (me && hasRole(me, ROLE_ADMINISTRATOR)) {
  /* reveal admin UI */
}
```
