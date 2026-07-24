---
description: Scaffold a new app in this monorepo following the repo's conventions (workspace, tsconfigs, Dockerfile, compose, proxy, dashboard wiring).
argument-hint: "<name> [url-prefix]"
---

# Scaffold a new homelab app

Arguments: `$1` = app name (directory + npm package name), `$2` = optional URL
prefix for the proxy (default: `/$1`).

**Port:** not an argument — determine it yourself. Read `docker-compose.yml`,
find the highest `600x` port in use, and take the next free one. Refer to it
as `<port>` below.

Follow `CLAUDE.md` ("Conventions for a new app") and `ARCHITECTURE.md`. Work
through the steps below in order; create only the layers the app needs.

## 1. Pick a reference app

Ask (or infer from the request) which shape fits, then copy its structure:

- **Full DDD layout** → copy `apps/recipe-book` (aggregates + repositories;
  trim layers the new app doesn't need — see `ARCHITECTURE.md` for lighter
  variants like `dynamic-vs-fixed`, `log-viewer`, `dashboard`).
- **Trivial static page** → copy `apps/ev-crossover` (just `Web/` + a bare
  composition-root `server.ts`).

## 2. Create `apps/$1/`

- `package.json` — name, `main`/`start` pointing at `dist/apps/$1/server.js`,
  scripts matching the reference app; list runtime deps of any `apps/Common/*`
  package it imports.
- **Three tsconfigs** (two for a static page with no client TS):
  - `tsconfig.json` — extends `../../tsconfig.base.json`, **pins
    `rootDir: "../.."`** (repo root) so emit nests as `dist/apps/$1/…`;
    includes `server.ts`, the DDD layers, and `test/`.
  - `tsconfig.build.json` — emit runtime code only to `dist/`, no tests.
  - `tsconfig.client.json` — `Web/client/*.ts` → `Web/public/*.js`, DOM libs,
    no Node types (skip if there's no client TypeScript).
- `server.ts` — thin composition root:
  `const app = createApp("$1")` → `Application/Registrations/register(app)`
  (if the app has routes) → `startServer(app, { name: "$1", port: Number(process.env.PORT) || <port> })`.
  Import shared kit by relative `.ts` path from `../Common/`.
- Remember the base-config constraints: `erasableSyntaxOnly` (no enums,
  namespaces, or parameter-properties) and relative imports written with the
  `.ts` extension.
- Client code must use **relative URLs** (`fetch('api/…')`, not `/api/…`) so
  the proxy prefix-stripping stays transparent.

## 3. Dockerfile

Copy from the reference app: builds from the **repo-root context** (so
`tsconfig.base.json` and `apps/Common/` are reachable), stages the Common
packages it uses in the builder, runs as the non-root `node` user.

## 4. Wire-up

- Root `package.json`: add `apps/$1` to the `workspaces` list (keep the
  existing ordering style).
- `docker-compose.yml`: add a service on `<port>` with a `homelab.name`
  label, `NODE_ENV=production`, a `/healthz` healthcheck, and a `LOG_DIR`
  volume; add `DATA_DIR` if it keeps state.
- If it logs: add a read-only volume mount for its logs in the `log-viewer`
  service.
- `proxy/nginx.conf`: add a `location` block for `$2` (default `/$1`)
  mirroring the existing app blocks (prefix is stripped before forwarding).
- `apps/dashboard/config/config.yaml`: add an `overrides:` entry so the
  dashboard links to the pretty path.

## 5. Verify

1. `npm install` (from the repo root, so the root lockfile is used).
2. Run `/check $1` (format, lint, typecheck, test).

## 6. Tell user to verify docker build
Tell user to run `docker build -f apps/$1/Dockerfile .` to prove the image builds.
