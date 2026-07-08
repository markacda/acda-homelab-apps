# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A monorepo (npm workspaces) of small independent Node/Express webapps that run as
Docker containers on a Raspberry Pi 5 (ARM64), each on its own port, aggregated by
a single `docker-compose.yml`. `apps/*` are the deployable apps; `apps/Common/*` are
the shared libraries. See `README.md` for the per-port app catalog, and
`ARCHITECTURE.md` for the DDD/Clean-Architecture layout apps are migrating to
(`apps/recipe-book` is the reference implementation).

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
`tsconfig.base.json` and `apps/Common/` are reachable):

```sh
docker compose up -d --build       # build + run everything
docker compose down
docker build -f apps/<name>/Dockerfile .   # build one image
```

## Architecture

**Per-app anatomy.** The remaining flat apps are `server.ts` (Express entry) +
`lib/` (pure logic, unit-tested) + `client/*.ts` (browser code) + `public/`
(compiled client output + static HTML/CSS) + `test/`.

**`apps/recipe-book`, `apps/dynamic-vs-fixed`, `apps/log-viewer`, `apps/dashboard`
and `apps/atc` are migrated** to the DDD/Clean-Architecture layout (`Domain/`,
`Application/`, `Adapters/`, `Ports/`, `Models/`, `Web/`) — see `ARCHITECTURE.md`.
`server.ts` is a thin composition root (`createApp` →
`Application/Registrations/register(app)` → `startServer`) and browser code lives
under `Web/client` → `Web/public` (served via `startServer`'s `staticDir` option).
recipe-book is the fuller reference (aggregates + repositories); dynamic-vs-fixed
shows a stateless calculation pipeline (external ports, no repository); log-viewer
shows a read-only analytics app (a store port + background ingest service + a
query/read model); dashboard shows discovery/config/health-probe ports with a
gated background monitor; atc shows a thin proxy (a validated `PointQuery` value
object + one external `AirplanesSource` adapter, `cors`/`compression`, and a
vendored `Web/public` with no client build — excluded from lint). The remaining
app (`ev-crossover`) will migrate over time; copy recipe-book as the template.

**TypeScript / build model.** Every app extends `tsconfig.base.json` (strict,
`nodenext`). Key constraints baked into the base config:

- `erasableSyntaxOnly` — Node runs `.ts` sources directly via native
  type-stripping, so **no enums, namespaces, or parameter-properties**.
- Relative imports are written with the **`.ts` extension** (e.g.
  `import ... from "../Common/access-log/logger.ts"`). `tsc` rewrites them to
  `.js` on emit (`rewriteRelativeImportExtensions`), keeping dist/ valid ESM.
- Each app has **three tsconfigs**: `tsconfig.json` (typecheck: server + lib +
  test), `tsconfig.build.json` (emit runtime code only to `dist/`, no tests), and
  `tsconfig.client.json` (compile `client/*.ts` → `public/*.js`, DOM libs, no Node
  types). `npm run build` runs the build + client configs; typecheck runs both.
  `apps/atc` is the exception — it has no `client/*.ts`, so no `tsconfig.client.json`
  and its `build`/`typecheck` are single-step.
- `server.ts` imports the shared kit from `../Common/` (a sibling under `apps/`).
  Each app's `tsconfig.json` pins **`rootDir: "../.."`** (the repo root) so the emit
  nests as `dist/apps/<name>/server.js` (matching each `package.json` `main`/`start`)
  and the shared code as `dist/apps/Common/...`. Without the pin, tsc would infer
  `apps/` as the root and flatten the output.

**Shared packages.** Three libraries under `apps/Common/*`, all imported by relative
`.ts` path (not by workspace name) and compiled into each app's `dist/` — so each
app's Dockerfile stages the packages it uses in the builder (`COPY apps/Common/<x>/...`),
and lists their runtime deps in its own `package.json`:

- **`@homelab/access-log`** — `pageLoadLogger`/`installConsoleLogging` (structured
  per-request `access.log` + mirrored `app.log`, daily-rotated + gzipped under
  `LOG_DIR`, ~90-day retention, skipping `/healthz` and `/health`); pure
  `buildEntry`/`buildAppLogEntry`; the `AccessLogEntry`/`AppLogEntry`/`LogLevel`
  types the `log-viewer` reads back; and the `DISCOVERY_UA` constant.
- **`@homelab/server-kit`** — the Express bootstrap: `createApp(name)` (installs
  console logging + mounts the access logger first) and `startServer` (mounts
  `/healthz` + `public/` static + a terminal error handler, binds `0.0.0.0`, and
  installs SIGTERM/SIGINT graceful shutdown), plus `healthHandler`/`errorHandler`.
- **`@homelab/http-utils`** — dependency-free query/body helpers (`firstStr`,
  `optStr`, `csvList`, `toStringArray`, `clampInt`) in `index.ts`; the multer-backed
  `memoryUpload` in `upload.ts` (kept separate so non-upload apps don't pull multer).

**Conventions for a new app.** For the layered DDD layout copy `apps/recipe-book`
(see `ARCHITECTURE.md`); for a trivial static/proxy app the flat `apps/ev-crossover`
is still a fine template. Either way: `const app = createApp("<name>")`, register
routes (directly, or via `Application/Registrations/register(app)`), then
`startServer(app, {name, port: Number(process.env.PORT) || <n>})` — this covers
`/healthz`, static, error handling, `0.0.0.0` bind, and graceful shutdown. Add the
app dir to the root `package.json` `workspaces` list. Build from the repo-root
Docker context with a non-root `node` user, then add a service to
`docker-compose.yml` on the next free port (with a `homelab.name` label,
`NODE_ENV=production`, and a `/healthz` healthcheck) and, if it logs, a read-only
volume mount in the `log-viewer` service.

**Env vars.** `PORT`, `LOG_DIR` (persistent log volume), `DATA_DIR` (persistent
state — `dynamic-vs-fixed`, `recipe-book`), plus app-specific ones (dashboard:
`HOST_ADDRESS` + read-only Docker socket for container auto-discovery; recipe-book:
`TECTONIC_CACHE_DIR` for the LaTeX toolchain).

## Lint scope

ESLint lints `.ts` sources only. `dist/`, `data/`, compiled client bundles
(`apps/*/public/*.js` and `apps/*/Web/public/*.js`), and all of `apps/atc/Web/public/**`
(vendored browser JS) are ignored. Node globals apply to `server`/`lib`/`test`, the
DDD layers (`Domain`/`Application`/`Adapters`/`Ports`/`Models`), and `apps/Common/*`;
browser globals apply to `apps/*/client/**` and `apps/*/Web/client/**`.
