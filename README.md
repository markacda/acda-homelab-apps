# acda-homelab-apps

A monorepo of small Node webapps that run in Docker on a Raspberry Pi 5 (ARM64),
each on its own port, all aggregated by a single `docker-compose.yml`.

## Port map

| Port            | App                | Description                                                                                                               |
| --------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| 80 / 443 / 8080 | `dashboard`        | Landing page: tiled dashboard that auto-discovers the other apps via the Docker socket and health-checks them             |
| 6001            | `atc`              | Live aircraft-tracking frontend (airplanes.live), TypeScript/Express server + static map UI                               |
| 6002            | `ev-crossover`     | Electricity price (€/kWh) at which charging is cheaper than petrol                                                        |
| 6003            | `dynamic-vs-fixed` | Whether a dynamic (hourly-market) energy contract beats your fixed one, from HomeWizard usage + EnergyZero prices (NL)    |
| 6004            | `log-viewer`       | Browse, search, filter and aggregate the structured access logs written by every app (per-app/per-endpoint stats, errors) |

## Run all apps

```sh
docker compose up -d --build
```

Then open the app in a browser, e.g. http://<pi-host>:6002 .

Stop everything:

```sh
docker compose down
```

## Local dev

The repo is an [npm workspace](https://docs.npmjs.com/cli/using-npm/workspaces),
so install everything once from the root:

```sh
npm install           # installs deps for all apps
```

The apps are TypeScript. In dev, Node runs the `.ts` sources directly (native
type-stripping, Node ≥24) and restarts on change:

```sh
npm run dev -w ev-crossover    # runs server.ts, serves on http://localhost:6002
```

Browser assets under `public/` are compiled from `client/*.ts` by the build, so
run the build once to (re)generate them (or to run the production output):

```sh
npm run build -w ev-crossover  # compiles server -> dist/ and client -> public/
npm start -w ev-crossover      # runs the compiled dist/server.js
```

Lint, format, type-check and test across all apps:

```sh
npm run lint
npm run format        # or: npm run format:check
npm run typecheck     # tsc --noEmit per app
npm test              # runs each app's tests (node --test)
```

> Docker builds each app image from the **repo-root context** (`docker build -f
apps/<name>/Dockerfile .`) so the shared `tsconfig.base.json` is reachable. The
> build stage compiles the TypeScript to `dist/`; the image then installs its own
> production deps. The root lockfile is what CI and local dev use.

## Logging

Every app writes a **structured access log** — one JSON object per request —
capturing page loads and their timing. Fields: `ts`, `app`, `method`, `url`,
`status`, `durationMs`, `ip`, `ua`, `referer`, `bytes`. Health-check requests
(`/healthz`, `/health`) are excluded to keep the log to real traffic.

Logs are written to `LOG_DIR` (`/app/logs` in Docker, backed by a per-app named
volume) as `access.log`, rotated daily and gzipped, with the most recent ~90
files kept — a **~3-month retention** window (via `rotating-file-stream`).

Read an app's logs:

```sh
docker exec dynamic-vs-fixed cat /app/logs/access.log        # today
docker exec dynamic-vs-fixed ls /app/logs                    # rotated + gzipped history
```

In local dev the log lands in `apps/<name>/logs/` (git-ignored).

Or use the **`log-viewer`** app (port 6004): it mounts every app's log volume
read-only and serves a scrollable, searchable, filterable UI over the full
3-month history, with accumulated stats (avg response time and request counts
per app and per endpoint, error counts/rates, status distribution, and more).
In dev, point it at the repo's logs with `LOGS_ROOT=./apps npm run dev -w log-viewer`.

## Adding a new app

1. Create `apps/<name>/` with a `Dockerfile`, `package.json`, `server.ts`,
   `tsconfig.json`/`tsconfig.build.json`/`tsconfig.client.json`, and `client/` +
   `public/` folders (copy `apps/ev-crossover` as a template). It is picked up by
   the workspace automatically.
2. Have the server listen on `process.env.PORT` and bind `0.0.0.0`.
3. Add a service to the root `docker-compose.yml` on the next free port (6003, 6004…).
