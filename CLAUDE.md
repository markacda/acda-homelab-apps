# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A monorepo (npm workspaces) of small independent Node/Express webapps that run as
Docker containers on a Raspberry Pi 5 (ARM64), each on its own `600x` port,
aggregated by a single `docker-compose.yml`. An nginx `proxy` container fronts
them all on host 80/443 and routes by path (dashboard at `/`, each app under a
prefix such as `/atc`); it strips the prefix before forwarding, so apps stay
unaware of it **provided their client code uses relative URLs** (`fetch('api/…')`,
not `/api/…`). See `proxy/nginx.conf`. `apps/*` are the deployable apps;
`apps/Common/*` are the shared libraries. See `README.md` for the URL/port
catalog, and `ARCHITECTURE.md` for the DDD/Clean-Architecture layout every app now
follows (`apps/recipe-book` is the reference implementation).

## Commands

Run from the repo root. Workspace scripts are targeted with `-w <name>` (the npm
package name, e.g. `ev-crossover`, `dynamic-vs-fixed`, `@homelab/access-log`).

```sh
npm install                        # installs deps for all workspaces (use the root lockfile)

npm run dev -w <app>               # runs server.ts directly via node --watch (type-stripping)
npm run build -w <app>             # compiles server -> dist/ and client -> Web/public/
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

**Per-app anatomy.** All apps are on the DDD/Clean-Architecture layout (`Domain/`,
`Application/`, `Adapters/`, `Ports/`, `Models/`, `Web/`) — see `ARCHITECTURE.md`.
`server.ts` is a thin composition root (`createApp` →
`Application/Registrations/register(app)` → `startServer`) and browser code lives
under `Web/client` → `Web/public` (served via `startServer`'s `staticDir` option).
Each app only creates the layers it needs. By example:

- **recipe-book** — the fuller reference: aggregates + repositories.
- **dynamic-vs-fixed** — a stateless calculation pipeline (external ports, no repository).
- **log-viewer** — a read-only analytics app (a store port + background ingest service + a query/read model). Four views over the four `@homelab/access-log` record kinds — Requests, Logs, Exceptions (grouped by name+message), Dependencies (HTTP + postgres, with failure rate + p95) — plus a rule-based alert monitor (`Domain/Services/alert-rules.ts`) that pushes anomaly notifications (5xx burst, error-rate, slow p95, exception burst) to the notification app with a per-rule cooldown.
- **dashboard** — discovery/config/health-probe ports with a gated background monitor.
- **atc** — a thin proxy (a validated `PointQuery` value object + one external `AirplanesSource` adapter, `cors`/`compression`, and a `Web/public` with no client build — a tar1090-derived browser app. Its own client code (`js/**`, `index.html`, `style.css`) is Prettier-formatted like every app; only the vendored third-party `libs/` and static assets stay unformatted, and the whole `Web/public` is excluded from ESLint).
- **ev-crossover** — a static page with no server-side domain at all: just `Web/` (the browser-side `crossover.ts` formula + UI) and a bare composition-root `server.ts` that serves it.
- **notification** — a notifications app with pluggable delivery: `POST /send` records every notification in a file-backed feed (shown in a small `Web/client` feed of recent ones) and then delivers it over any channels named in an **optional** `channels` list. The feed is not a channel — it is always written; channels are extra delivery mechanisms (a `NotificationChannel` port, one adapter each). `email` is a wired skeleton (env-gated on `SMTP_HOST`, `deliver()` stubbed); push/websocket/webhook are documented drop-in candidates. An unknown channel name is a 400.

**TypeScript / build model.** Every app extends `tsconfig.base.json` (strict,
`nodenext`). Key constraints baked into the base config:

- `erasableSyntaxOnly` — Node runs `.ts` sources directly via native
  type-stripping, so **no enums, namespaces, or parameter-properties**.
- Relative imports are written with the **`.ts` extension** (e.g.
  `import ... from "../Common/access-log/logger.ts"`). `tsc` rewrites them to
  `.js` on emit (`rewriteRelativeImportExtensions`), keeping dist/ valid ESM.
- Each app has **three tsconfigs**: `tsconfig.json` (typecheck: `server.ts` + the DDD
  layers + test), `tsconfig.build.json` (emit runtime code only to `dist/`, no tests), and
  `tsconfig.client.json` (compile `Web/client/*.ts` → the served `Web/public`, DOM libs, no
  Node types). `npm run build` runs the build + client configs; typecheck runs both.
- **Shared frontend build.** An app whose browser code imports a shared **browser** package
  (`@homelab/auth-client`, `@homelab/web-kit`) pins its client `rootDir` at the repo root —
  the same trick the server build uses — so the shared source compiles in too. The client
  output then nests under `Web/public/apps/…` (the app's own bundle beside `apps/Common/…`),
  which keeps the emitted relative import (`../../../Common/<pkg>/index.js`) valid at runtime;
  the app's entry `<script src>` points at the nested path. Apps with no shared-frontend
  imports keep the flat `rootDir: Web/client` (output straight in `Web/public`). `apps/atc`'s
  `Web/public` is otherwise vendored (tar1090); its only compiled client code is the shared
  auth-guard module, so it gained a `tsconfig.client.json` (backend emit still single-step).
- `server.ts` imports the shared kit from `../Common/` (a sibling under `apps/`).
  Each app's `tsconfig.json` pins **`rootDir: "../.."`** (the repo root) so the emit
  nests as `dist/apps/<name>/server.js` (matching each `package.json` `main`/`start`)
  and the shared code as `dist/apps/Common/...`. Without the pin, tsc would infer
  `apps/` as the root and flatten the output.

**Shared packages.** Six libraries under `apps/Common/*`, all imported by relative
`.ts` path (not by workspace name). The four **server** libraries below compile into each
app's `dist/`; the two **browser** libraries (`@homelab/auth-client`, `@homelab/web-kit`)
compile into the app's `Web/public` via `tsconfig.client.json` (see the shared-frontend
build above). Either way each app's Dockerfile stages the packages it uses in the builder
(`COPY apps/Common/<x>/...`), and the server packages list their runtime deps in the app's
own `package.json`:

- **`@homelab/access-log`** — the structured-logging kit. Four JSON-Lines record
  kinds, all daily-rotated + gzipped under `LOG_DIR` (~30-day retention): per-request
  `access.log` (`pageLoadLogger`, skipping `/healthz`/`/health`), mirrored console
  `app.log` (`installConsoleLogging`), first-class `exceptions.log`
  (`logException` + `installProcessExceptionHandlers` for uncaught/unhandledRejection),
  and outbound-call `dependencies.log` (`installFetchLogging` wraps global `fetch`;
  `logDependency` also used by `@homelab/db`). A per-request `traceId`
  (`AsyncLocalStorage`, exposed via `currentTraceId`) correlates the app-logs,
  dependencies and exceptions a request produces. Pure builders
  (`buildEntry`/`buildAppLogEntry`/`buildException`/`buildDependency`); the
  `AccessLogEntry`/`AppLogEntry`/`ExceptionLogEntry`/`DependencyLogEntry`/`LogLevel`
  types the `log-viewer` reads back; and the `DISCOVERY_UA` constant.
- **`@homelab/server-kit`** — the Express bootstrap: `createApp(name)` (installs
  console logging, `fetch` dependency logging, and process-level exception handlers,
  then mounts the access logger first) and `startServer` (mounts `/healthz` +
  `public/` static + a terminal error handler that also records an exception, binds
  `0.0.0.0`, and installs SIGTERM/SIGINT graceful shutdown), plus
  `healthHandler`/`errorHandler`.
- **`@homelab/http-utils`** — dependency-free query/body helpers (`firstStr`,
  `optStr`, `csvList`, `toStringArray`, `clampInt`) in `index.ts`; the multer-backed
  `memoryUpload` in `upload.ts` (kept separate so non-upload apps don't pull multer).
- **`@homelab/db`** — the shared PostgreSQL kit: `createPool`/`closePool` (an async
  `pg.Pool` factory whose connection string comes from `DATABASE_URL_FILE` → `DATABASE_URL`
  → discrete `PG*`; when `DATABASE_URL_FILE` is set it waits, bounded, for the db
  container to provision that secret file rather than crash-looping on ENOENT —
  tunable via `DATABASE_URL_FILE_WAIT_MS`), `runMigrations(pool, {schema, dir})` (an idempotent, fail-loud
  SQL-file migration runner recording applied files in `<schema>.schema_migrations`),
  and `pingDb` (a `SELECT 1` for `startServer`'s `healthCheck`). `createPool` also
  wraps `pool.query` to time each query as a postgres dependency (see
  `@homelab/access-log`); queries via an explicit `pool.connect()` client aren't
  captured. Used by the data-owning apps; `startServer`'s `onShutdown` closes the pool.
- **`@homelab/auth-client`** — the shared **browser** auth helpers (client-side counterpart
  of `@homelab/auth`): the same-origin `installAuthRedirect` fetch guard that bounces a 401
  to `/auth/?redirect=…`, the `fetchCurrentUser`/`hasRole` "who am I" call over `GET api/me`
  (the `PersonView` shape + `ROLE_*` names), and `apiJson` (a `{ error }`/204-aware JSON
  fetch). Used by recipe-book, log-viewer and atc (the guard) and the auth pages (the
  me/role helpers). Browser-only (DOM libs, no Node types); no runtime deps.
- **`@homelab/web-kit`** — shared **browser** DOM micro-helpers (`$` throwing getter, `el`
  createElement, `setStatus` banner) that were copy-pasted across the clients. No deps.

**Database.** A single `db` service (`postgres:17-alpine`) backs the data-owning apps
(**notification**, **recipe-book**); the stateless apps and dynamic-vs-fixed's
regenerable price cache stay off it. It's internal-only (no published port, reachable
as host `db`), with one database `homelab` and a **schema + login role per app**
(`notification`, `recipe_book`), each role's `search_path` defaulting to its schema.
Credentials **self-provision**: `db/entrypoint.sh` generates the superuser password
and then runs `db/provision-roles.sh` **idempotently on every boot** (a background
waiter fires once the server is ready; `db/init/10-roles.sh` runs the same shared
provisioner on fresh-volume init), generating a per-app password + writing
`/secrets/<role>.url` to the shared `db-secrets` volume, which apps read via
`DATABASE_URL_FILE` — so there's no `.env` and no manual secret, and a newly added
role appears on the next `docker compose up -d --force-recreate db` with no volume wipe
(the boot provisioner only runs when the db container (re)starts, and plain
`up -d --build db` won't recreate an otherwise-unchanged, bind-mount-only db service).
Treat the `pg-data` and `db-secrets` volumes as a matched pair. **Schema/data
changes go through numbered app migrations, never the init sh scripts** (which only
bootstrap roles/schemas/credentials): migrations live per app under
`Adapters/Postgres/migrations/NNN_*.sql` (shipped into `dist/` by the Dockerfile,
since tsc doesn't emit `.sql`) and run at startup. recipe-book keeps its data volume
for image bytes + generated PDFs. See `docs/database-migration.md`.

**Conventions for a new app.** Copy `apps/recipe-book` for the full layered DDD
layout, or `apps/ev-crossover` for a trivial static page (see `ARCHITECTURE.md`;
create only the layers you need). Either way: `const app = createApp("<name>")`,
register routes (via `Application/Registrations/register(app)`), then
`startServer(app, {name, port: Number(process.env.PORT) || <n>})` — this covers
`/healthz`, static, error handling, `0.0.0.0` bind, and graceful shutdown. Add the
app dir to the root `package.json` `workspaces` list. Build from the repo-root
Docker context with a non-root `node` user, then add a service to
`docker-compose.yml` on the next free port (with a `homelab.name` label,
`NODE_ENV=production`, and a `/healthz` healthcheck) and, if it logs, a read-only
volume mount in the `log-viewer` service. To expose it on a pretty path, add a
`location` block to `proxy/nginx.conf` (and use relative URLs in its client code);
to show it on the dashboard at that path, add an `overrides:` entry in
`apps/dashboard/config/config.yaml`.

**Env vars.** `PORT`, `LOG_DIR` (persistent log volume), `DATA_DIR` (persistent
state — `dynamic-vs-fixed` price cache; `recipe-book` images/PDFs), `DATABASE_URL_FILE`
(path to the self-provisioned connection string on the `db-secrets` volume —
`recipe-book`, `notification`), plus app-specific
ones (dashboard: `HOST_ADDRESS` + read-only Docker socket for container auto-discovery;
recipe-book: `TECTONIC_CACHE_DIR` for the LaTeX toolchain; notification: optional
`SEND_TOKEN` guarding `POST /send`, plus optional `SMTP_HOST`/`SMTP_PORT`/
`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM`/`SMTP_TO` that register the email channel
skeleton; log-viewer: `NOTIFICATION_URL` (+ optional `SEND_TOKEN`) to post rule-based
alerts to the notification app, tuned by optional `ALERT_WINDOW_MS` (default 5 min),
`ALERT_ERROR_BURST` (5xx count, default 5), `ALERT_ERROR_RATE` (0..1, default 0.5),
`ALERT_SLOW_P95_MS` (default 3000), `ALERT_EXCEPTION_BURST` (default 5),
`ALERT_MIN_SAMPLE` (default 20), and `ALERT_COOLDOWN_MS` (default 15 min) — a rule with
a 0 threshold is disabled).

**Notifications.** The **notification** app (`/notificaties`) records every
notification in a persistent feed (shown in the recent-notifications UI) and can
additionally deliver it over pluggable channels. Other apps call `POST /send`
(e.g. `log-viewer` when an alert rule fires — 5xx burst, error-rate, slow p95, or
exception burst over a trailing window); an **optional** `channels` array
names extra delivery channels to fan out to (an unknown name is a `400`, and one
channel failing never fails the request or the feed). The feed is always written
and is not itself a channel. `email` is a wired-but-stubbed skeleton showing how to
add a real channel.

## Code style

**Comments.** Prefer self-explanatory code (clear naming and structure) over narration.
Add a comment only when it carries something the code cannot: a non-obvious _why_, a
constraint or workaround (e.g. the proxy/build/runtime notes throughout this repo), an
external/issue reference, or a subtle gotcha. Avoid comments that restate the adjacent
code and decorative `// ---- section ----` divider banners. JSDoc on exported APIs,
`// eslint-disable` directives, and the occasional `TODO`/`NOTE` are fine.

## Lint scope

ESLint lints `.ts` sources only. `dist/`, `data/`, compiled client bundles
(`apps/*/public/*.js` and `apps/*/Web/public/*.js`), and all of `apps/atc/Web/public/**`
(browser JS with no build pipeline) are ignored. Node globals apply to `server.ts`/`test`, the
DDD layers (`Domain`/`Application`/`Adapters`/`Ports`/`Models`), and `apps/Common/*`;
browser globals apply to `apps/*/Web/client/**`.

Prettier's scope is wider than ESLint's for atc: while ESLint skips all of
`apps/atc/Web/public/**`, `.prettierignore` only excludes the vendored `libs/` and
static-asset dirs (`flags/`, `geojson/`, `images/`) there — atc's own client code
(`js/**`, `index.html`, `style.css`) is formatted like every other app.
