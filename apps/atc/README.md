# atc — Aircraft Tracker

A live aircraft-tracking web frontend (OpenLayers map UI + [airplanes.live](https://airplanes.live)
data) served by a thin TypeScript/Express backend. The backend is a **proxy**: it
validates the browser's request parameters and forwards them to airplanes.live, so the
map UI never talks to the upstream API directly. Runs on **port 6001** in the homelab
`docker-compose.yml`.

> This is one app in the `acda-homelab-apps` monorepo. For repo-wide commands, the build
> model, and how apps are deployed, see the root [`README.md`](../../README.md),
> [`CLAUDE.md`](../../CLAUDE.md), and [`ARCHITECTURE.md`](../../ARCHITECTURE.md). This file
> only covers what is specific to `atc`.

## Features

- Real-time aircraft tracking on an interactive OpenLayers map
- GeoJSON overlays (military zones, airspace boundaries, refuelling areas)
- Country-flag display for aircraft registrations
- A CORS-enabled, parameter-validated proxy in front of the airplanes.live API
- Response compression and a `/healthz` endpoint (from the shared server-kit)

## Architecture

`atc` follows the repo's DDD/Clean-Architecture layout (see
[`ARCHITECTURE.md`](../../ARCHITECTURE.md)), as a **thin proxy** — so it creates only the
layers it needs and has **no `Models/` and no client build**:

```
apps/atc/
  server.ts                        # composition root: createApp -> register -> startServer
  Domain/
    ValueObjects/point-query.ts    # PointQuery: validated lat/lon/radius (the only domain rule)
    Exceptions/                    # DomainError + ValidationError/ProxyError subclasses
  Application/
    Controllers/airplanes-controller.ts   # the /api proxy routes
    Filters/error-mapping.ts              # DomainError -> HTTP status middleware
    Registrations/register.ts             # manual wiring (CORS/compression, static, routes)
  Ports/AirplanesLive/airplanes-source.ts # interface to the upstream API
  Adapters/AirplanesLive/http-airplanes-source.ts   # fetch-based implementation
  Web/public/                      # VENDORED browser frontend (no client build):
    index.html, style.css, js/, libs/, images/, geojson/, flags/
```

Notes specific to `atc`:

- **No `Web/client` / `tsconfig.client.json`.** `Web/public` is vendored browser JS/CSS +
  assets with no compile step, so `build`/`typecheck` are single-step (`tsc -p
  tsconfig.build.json`) and the whole of `Web/public/**` is excluded from lint.
- **`register()` mounts the static frontend itself** (`express.static` on `Web/public`
  with 1-day caching) plus permissive CORS and compression, so `server.ts` passes
  `staticDir: null` to `startServer` to avoid double-serving.
- `tsconfig.json` pins `rootDir: "../.."` (repo root) — like every app — so the emit nests
  as `dist/apps/atc/server.js`. The shared kit is imported by relative path from
  `../Common/` (there is no `packages/` dir).

## API

The frontend calls these proxy routes (mounted under `/api` by `AirplanesController`):

| Route | Proxies |
| --- | --- |
| `GET /api/airplanes/:lat/:lon/:radius` | `api.airplanes.live` point query |
| `GET /api/globe-airplanes-live/*splat` | `globe.airplanes.live` pass-through |

`PointQuery` (`Domain/ValueObjects/point-query.ts`) validates the point-query params before
anything upstream is hit — invalid input throws a `ValidationError` mapped to `400`:

- **Latitude**: between -90 and 90
- **Longitude**: between -180 and 180
- **Radius**: 1 to 250 nautical miles

Example: `GET http://localhost:6001/api/airplanes/51.9082/-3.1966/50`.

## Local dev

From the repo root (see the root README for the full toolchain):

```sh
npm run dev -w atc          # runs server.ts on http://localhost:6001 (node --watch)
npm run build -w atc        # compiles the backend to dist/
npm start -w atc            # runs the compiled dist/apps/atc/server.js
npm run typecheck -w atc
npm test -w atc
```

## Configuration

Environment variables (set by the `atc` service in the root `docker-compose.yml`):

- `PORT` — server port (default `6001`)
- `NODE_ENV` — `production` in Docker
- `LOG_DIR` — access-log directory (`/app/logs` in Docker, backed by the `atc-logs` volume)

CORS is intentionally permissive (all origins allowed) so the browser map can reach the
proxy from any host; adjust it in `Application/Registrations/register.ts` if you need to
lock it down.

## Docker

The image builds from the **repo-root context** (so the shared `tsconfig.base.json` and
`apps/Common/*` are reachable) and runs as the non-root `node` user:

```sh
docker build -f apps/atc/Dockerfile .   # build just this image
docker compose up -d --build atc        # build + run via the aggregate compose file
```

The builder compiles the backend to `dist/`; the runtime stage copies `dist/` plus the
vendored `Web/public/` and installs production deps only.

## Roadmap

Ideas for a more ATC-like display (not yet implemented):

- History dots at fixed time intervals instead of continuous trails
- Approach centerlines / extended runway centerlines for major Dutch airports (EHAM, EHRD, EHEH)
- Airspace sector boundaries with names/codes and control frequencies
- Short-Term Conflict Alert (STCA) when predicted separation minima are violated
- Situation-display filter modes (arrivals / departures / overflights / emergency squawks)
