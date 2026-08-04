# @homelab/auth

Shared authN/authZ Express middleware for the homelab apps. It verifies the
**access-token cookie** issued by the `auth` app and guards routes by role, so a
protected app enforces authentication without any app-specific auth code.

Tokens are HS256 JWTs (via [`jose`](https://github.com/panva/jose)) carrying the
person id as `sub` and their `roles`, in an `httpOnly`, `SameSite=Lax`,
`Path=/` cookie named `access_token` — shared across every app behind the nginx
proxy (single sign-on). See `apps/auth` for the issuer.

Like the other `apps/Common/*` libraries, this is imported by **relative `.ts`
path** (not by package name) and compiled into each consuming app's `dist/`.

## Exports

- `requireAuth` — verifies the access-token cookie. On success stashes the claims
  on `res.locals.auth` (`{ sub, roles }`) and calls `next()`. Missing / invalid /
  expired token → **401 `{ "error": "unauthorized" }`**.
- `requireRole(...roles)` — runs `requireAuth`, then requires the person to hold
  **at least one** of `roles`. Authenticated but lacking a role → **403
  `{ "error": "forbidden" }`**.
- `ROLE_USER` (`'User'`) / `ROLE_ADMINISTRATOR` (`'Administrator'`) — the roles the
  auth app models.
- `createAuth(options)` — factory returning `{ requireAuth, requireRole }` when you
  need to inject a verifier/secret (mainly tests). See [Configuration](#configuration).
- Lower-level helpers: `joseVerifier(secret)`, `loadJwtSecret()`, `ACCESS_COOKIE`,
  `parseCookies`, `readCookie`, and the `AuthClaims` / `TokenVerifier` types.

`/healthz` and `/health` are **never gated** — an app-wide guard still leaves the
container healthcheck public.

## Usage

Both styles use the env-backed default guards (the signing secret is read from the
environment on first request — see [Configuration](#configuration)).

**Per-endpoint** — require a role on a single route:

```ts
import { Router } from 'express';
import { requireRole, ROLE_ADMINISTRATOR } from '../Common/auth/index.ts';

const router = Router();
router.get('/admin/report', requireRole(ROLE_ADMINISTRATOR), (_req, res) => {
  res.json({ ok: true });
});
```

**App-wide** — guard everything in an app's `register()`, mounted after static and
health so public assets and `/healthz` stay open:

```ts
import { requireRole, ROLE_USER } from '../Common/auth/index.ts';

export function register(app: Express): void {
  // ...static, etc.
  app.use(requireRole(ROLE_USER)); // everything below now requires a signed-in User
  app.use('/api', controller.router);
}
```

Read the identity in a handler via `res.locals.auth` (`{ sub, roles }`).

## Configuration

The middleware only **verifies** tokens, so it must use the **same secret the auth
app signs with** — it never generates one. `loadJwtSecret()` reads, in order:

- **`JWT_SECRET_FILE`** — path to the auth app's persisted key (base64 of 32+ raw
  bytes). Preferred in production; point consuming containers at the same key.
- **`JWT_SECRET`** — inline secret (its UTF-8 bytes), for local dev / tests.

If neither is set, the first guarded request throws. To inject a secret explicitly
(e.g. in unit tests) use the factory:

```ts
import { createAuth } from '../Common/auth/index.ts';
const { requireAuth, requireRole } = createAuth({ secret: mySecretBytes });
// or a custom verifier / cookie name / public paths:
createAuth({ verify, cookieName: 'access_token', publicPaths: ['/healthz'] });
```

## Consuming from an app

Because Common code compiles into each app's `dist/`, a consuming app must, in
addition to importing it:

1. Add `"jose"` to its own `package.json` `dependencies` (the production Docker
   stage installs from the app manifest with `--omit=dev`).
2. Stage the package in its Dockerfile builder, mirroring the other Common
   packages:

   ```dockerfile
   WORKDIR /repo/apps/Common/auth
   COPY apps/Common/auth/package.json ./
   RUN --mount=type=cache,target=/root/.npm npm install --prefer-offline --no-audit --no-fund
   COPY apps/Common/auth/ ./
   ```

3. Ensure the container can reach the same signing secret (mount the auth
   `JWT_SECRET_FILE` key, or share `JWT_SECRET`).

## Tests

```sh
npm test -w @homelab/auth
```
