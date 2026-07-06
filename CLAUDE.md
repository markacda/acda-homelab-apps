# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A monorepo (npm workspaces) of small independent Node/Express webapps that run as
Docker containers on a Raspberry Pi 5 (ARM64), each on its own port, aggregated by
a single `docker-compose.yml`. `apps/*` are the deployable apps; `packages/*` are
shared libraries. See `README.md` for the per-port app catalog.

## Commands

Run from the repo root. Workspace scripts are targeted with `-w <name>` (the npm
package name, e.g. `ev-crossover`, `dynamic-vs-fixed`, `@homelab/access-log`).

```sh
npm install                        # installs deps for all workspaces (use the root lockfile)

npm run dev -w <app>               # runs server.ts directly via node --watch (type-stripping)
npm run build -w <app>             # compiles server -> dist/ and client -> public/
npm start -w <app>                 # runs compiled dist/.../server.js

npm run lint                       # eslint . (add lint:fix to autofix)
npm run format                     # prettier --write . (format:check to verify)
npm run typecheck                  # tsc --noEmit per workspace
npm test                           # each workspace's `node --test`
```

Single test file / single workspace:

```sh
npm test -w ev-crossover                          # one app's tests
node --test apps/ev-crossover/test/foo.test.ts    # one file (Node's built-in runner)
node --test --test-name-pattern="crossover"       # filter by test name
```

Docker (each image builds from the **repo-root context** so the shared
`tsconfig.base.json` and `packages/` are reachable):

```sh
docker compose up -d --build       # build + run everything
docker compose down
docker build -f apps/<name>/Dockerfile .   # build one image
```

## Architecture

**Per-app anatomy.** A typical app is `server.ts` (Express entry) + `lib/` (pure
logic, unit-tested) + `client/*.ts` (browser code) + `public/` (compiled client
output + static HTML/CSS) + `test/`. `apps/atc` is the outlier: its server lives
in `server/` (entry `server/index.ts`) and its browser assets are vendored JS in
`src/` (excluded from lint/build, no client compile step).

**TypeScript / build model.** Every app extends `tsconfig.base.json` (strict,
`nodenext`). Key constraints baked into the base config:
- `erasableSyntaxOnly` — Node runs `.ts` sources directly via native
  type-stripping, so **no enums, namespaces, or parameter-properties**.
- Relative imports are written with the **`.ts` extension** (e.g.
  `import ... from "../../packages/access-log/logger.ts"`). `tsc` rewrites them to
  `.js` on emit (`rewriteRelativeImportExtensions`), keeping dist/ valid ESM.
- Each app has **three tsconfigs**: `tsconfig.json` (typecheck: server + lib +
  test), `tsconfig.build.json` (emit runtime code only to `dist/`, no tests), and
  `tsconfig.client.json` (compile `client/*.ts` → `public/*.js`, DOM libs, no Node
  types). `npm run build` runs the build + client configs; typecheck runs both.
- `server.ts` imports the shared logger from `../../packages/`, above the app dir,
  so the common source root is the repo root — hence dist nests as
  `dist/apps/<name>/server.js` (matches each `package.json` `main`/`start`).

**Shared access logging (`packages/access-log`).** Every server mounts
`app.use(pageLoadLogger("<app-name>"))` as its first middleware. It writes one
structured JSON line per request to a daily-rotated, gzipped `access.log` under
`LOG_DIR` (~90-day retention), skipping `/healthz` and `/health`. `buildEntry` is
kept pure and side-effect-free so it can be unit-tested without a real socket; the
rotating stream opens lazily on first write. The `log-viewer` app mounts every
app's log volume read-only and reads `AccessLogEntry` records back.

**Conventions for a new app** (copy `apps/ev-crossover` as the template): listen on
`process.env.PORT`, bind `0.0.0.0`, expose `/healthz` (or `/health`), mount the
access logger first, build from the repo-root Docker context with a non-root
`node` user, then add a service to `docker-compose.yml` on the next free port and
(if it logs) a read-only volume mount in the `log-viewer` service.

**Env vars.** `PORT`, `LOG_DIR` (persistent log volume), `DATA_DIR` (persistent
state — `dynamic-vs-fixed`, `recipe-book`), plus app-specific ones (dashboard:
`HOST_ADDRESS` + read-only Docker socket for container auto-discovery; recipe-book:
`TECTONIC_CACHE_DIR` for the LaTeX toolchain).

## Lint scope

ESLint lints `.ts` sources only. `dist/`, `data/`, compiled `apps/*/public/*.js`,
and all of `apps/atc/src/**` (vendored browser JS) are ignored. Node globals apply
to `server`/`lib`/`test`/`packages`; browser globals apply to `apps/*/client/**`.
