# acda-homelab-apps

A monorepo of small Node webapps that run in Docker on a Raspberry Pi 5 (ARM64),
each on its own port, all aggregated by a single `docker-compose.yml`.

## Port map

| Port            | App                | Description                                                                                                            |
| --------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| 80 / 443 / 8080 | `dashboard`        | Landing page: tiled dashboard that auto-discovers the other apps via the Docker socket and health-checks them          |
| 6001            | `atc`              | Live aircraft-tracking frontend (airplanes.live), TypeScript/Express server + static map UI                            |
| 6002            | `ev-crossover`     | Electricity price (€/kWh) at which charging is cheaper than petrol                                                     |
| 6003            | `dynamic-vs-fixed` | Whether a dynamic (hourly-market) energy contract beats your fixed one, from HomeWizard usage + EnergyZero prices (NL) |

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

Run a single app:

```sh
npm start -w ev-crossover      # serves on http://localhost:6002
```

Lint, format and test across all apps:

```sh
npm run lint
npm run format        # or: npm run format:check
npm test              # runs each app's tests (node --test)
```

> Docker still builds each app in isolation (`build: ./apps/<name>`), so every
> app keeps its own `package-lock.json` for `npm ci` inside the image. The root
> lockfile is what CI and local dev use.

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

## Adding a new app

1. Create `apps/<name>/` with a `Dockerfile`, `package.json`, `server.js`, and a
   `public/` folder (copy `apps/ev-crossover` as a template). It is picked up by
   the workspace automatically.
2. Have the server listen on `process.env.PORT` and bind `0.0.0.0`.
3. Add a service to the root `docker-compose.yml` on the next free port (6003, 6004…).
