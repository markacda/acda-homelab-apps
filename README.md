# acda-homelab-apps

A monorepo of small Node webapps that run in Docker on a Raspberry Pi 5 (ARM64),
all aggregated by a single `docker-compose.yml`. An nginx `proxy` container fronts
them over HTTPS and routes by path (dashboard at `/`, each app under its own
prefix). Every app also stays directly reachable on its own `600x` port.

## URL map

Served through the proxy on `https://<pi-host>/` (recommended). The proxy uses a
**self-signed** certificate generated on first boot, so browsers show a one-time
trust warning; plain HTTP on port 80 redirects to HTTPS. The direct `600x` ports
stay plain HTTP.

| Path                 | App                | Direct port | Description                                                                                                                                   |
| -------------------- | ------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                  | `dashboard`        | 6000        | Landing page: tiled dashboard that auto-discovers the other apps via the Docker socket and health-checks them                                 |
| `/atc`               | `atc`              | 6001        | Live aircraft-tracking frontend (airplanes.live), TypeScript/Express server + static map UI                                                   |
| `/laden-of-tanken`   | `ev-crossover`     | 6002        | Electricity price (€/kWh) at which charging is cheaper than petrol                                                                            |
| `/dynamisch-of-vast` | `dynamic-vs-fixed` | 6003        | Whether a dynamic (hourly-market) energy contract beats your fixed one, from HomeWizard usage + EnergyZero prices (NL)                        |
| `/logs`              | `log-viewer`       | 6004        | Browse, search, filter and aggregate the structured access logs written by every app (per-app/per-endpoint stats, errors)                     |
| `/receptenboek`      | `recipe-book`      | 6005        | Import Albert Heijn (Allerhande) recipes into a shared library, assemble named recipe books, and export them as LaTeX / PDF                   |
| `/notificaties`      | `notification`     | 6006        | Collects notifications from the other apps (via `POST /send`) and shows a feed of recent ones, e.g. failed-request alerts from the log viewer |

The proxy (`proxy/nginx.conf`) strips the path prefix before forwarding, so each
app is unaware it's served under a subpath — the only requirement is that app
client code uses **relative** URLs (e.g. `fetch('api/…')`, not `/api/…`).

## Run all apps

```sh
docker compose up -d --build
```

#### For running on Raspberry Pi

```sh
cd ~/Code/acda-homelab-apps/ && git pull && docker compose up -d --build
```

Then open the dashboard at https://<pi-host>/ (accept the self-signed-cert
warning), or an app directly, e.g. https://<pi-host>/laden-of-tanken (or its
plain-HTTP direct port http://<pi-host>:6002 ).

Stop everything:

```sh
docker compose down
```

### TLS certificate

The proxy generates a self-signed cert on first boot (see
`proxy/generate-selfsigned-cert.sh`) into the persistent `proxy-certs` volume,
valid for 10 years. Set `TLS_SAN` on the `proxy` service (e.g.
`DNS:localhost,IP:127.0.0.1,IP:<pi-ip>`) to name the Pi before that first boot.

Generation is idempotent — it only runs when no cert exists — so to renew an
expired cert (symptom: browsers report `NET::ERR_CERT_DATE_INVALID`) or to
regenerate after changing `TLS_SAN`, delete the old cert and restart:

```sh
docker exec proxy rm -f /etc/nginx/certs/privkey.pem /etc/nginx/certs/fullchain.pem
docker compose restart proxy        # entrypoint regenerates on boot
```

The new cert is again self-signed, so clients must re-accept the trust warning.

## Docker maintenance & disk cleanup

The Pi has limited storage, and repeated `docker compose up --build` leaves behind
dangling images and a growing build cache. Inspect what's using space, then prune.

Inspect:

```sh
docker compose ps                 # this stack's containers (add -a to include stopped)
docker ps -a                      # all containers, running and stopped
docker images                     # all images, with sizes
docker system df                  # disk used by images, containers, volumes, build cache
docker system df -v               # verbose per-item breakdown (which image/volume is big)
```

Clean up (reclaim space):

```sh
docker image prune               # remove dangling (untagged) images
docker image prune -a            # remove all images not used by a container
docker builder prune             # clear the build cache (biggest win after many rebuilds)
docker container prune           # remove stopped containers
docker system prune              # dangling images + stopped containers + unused networks + build cache
docker system prune -a --volumes # aggressive: also removes unused images and unused volumes
```

> ⚠️ `--volumes` deletes volumes not attached to a running container, which for this
> stack includes the persistent app data and logs (`DATA_DIR`, `LOG_DIR`) and the
> `proxy-certs` cert if the stack is down. Bring the stack back up (or omit
> `--volumes`) to keep that data. A plain `docker system prune` is the safe default.

Rebuild fresh after pruning:

```sh
docker compose up -d --build
```

## Notifications

The `notification` app (`/notificaties`) records every notification in a
persistent feed and shows the recent ones. Other apps post to its internal
`POST /send` endpoint — for example the `log-viewer` calls it when new
server-error (`>=500`) requests appear.

Beyond the always-written feed, a notification can be **delivered** over pluggable
channels: include an optional `channels` array in the `POST /send` body naming the
mechanisms to fan out to (an unknown name is rejected with a `400`). Channels are
pluggable (Ports/Adapters); `email` is a wired skeleton, enabled by setting
`SMTP_HOST` but with sending not yet implemented. Push, websocket and webhook are
documented drop-in candidates.

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

Browser assets under `Web/public/` are compiled from `Web/client/*.ts` by the
build, so run the build once to (re)generate them (or to run the production output):

```sh
npm run build -w ev-crossover  # compiles server -> dist/ and client -> Web/public/
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
volume) as `access.log`, rotated daily and gzipped, with the most recent ~30
files kept — a **~1-month retention** window (via `rotating-file-stream`).

Read an app's logs:

```sh
docker exec dynamic-vs-fixed cat /app/logs/access.log        # today
docker exec dynamic-vs-fixed ls /app/logs                    # rotated + gzipped history
```

In local dev the log lands in `apps/<name>/logs/` (git-ignored).

Or use the **`log-viewer`** app (port 6004): it mounts every app's log volume
read-only and serves a scrollable, searchable, filterable UI over the full
1-month history, with accumulated stats (avg response time and request counts
per app and per endpoint, error counts/rates, status distribution, and more).
In dev, point it at the repo's logs with `LOGS_ROOT=./apps npm run dev -w log-viewer`.

## Adding a new app

1. Create `apps/<name>/` with a `Dockerfile`, `package.json`, `server.ts`, and the
   `tsconfig.json`/`tsconfig.build.json`/`tsconfig.client.json` trio. Every app uses
   the DDD/Clean-Architecture layout (see [`ARCHITECTURE.md`](ARCHITECTURE.md), creating
   only the layers it needs): copy `apps/recipe-book` for a full layered app, or
   `apps/ev-crossover` for a trivial static page (just `Web/` and a bare composition-root
   `server.ts`). Add the new dir to the
   root `package.json` `workspaces` list.
2. Build the server on the shared bootstrap: `const app = createApp("<name>")`
   then `startServer(app, { name: "<name>", port: Number(process.env.PORT) || <n> })`
   from `apps/Common/server-kit` — it mounts the access logger, exposes `/healthz`,
   serves `public/`, binds `0.0.0.0`, and wires graceful shutdown + an error
   handler. Reuse `apps/Common/http-utils` for query/body parsing and file uploads.
   Use **relative** URLs in client code (`fetch('api/…')`, `src="images/…"`) so the
   app works under the reverse proxy's path prefix.
3. Add a service to the root `docker-compose.yml` on the next free port (6006, 6007…).
4. Add a `location /<path>/ { proxy_pass http://<service>:<port>/; … }` block (plus the
   trailing-slash redirect) to the HTTPS server in `proxy/nginx.conf`, and — if it should appear on the
   dashboard — an `overrides:` entry in `apps/dashboard/config/config.yaml` pointing its
   tile at the new path.
