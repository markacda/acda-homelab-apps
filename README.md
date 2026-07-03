# acda-homelab-apps

A monorepo of small Node webapps that run in Docker on a Raspberry Pi 5 (ARM64),
each on its own port, all aggregated by a single `docker-compose.yml`.

## Port map

| Port | App                | Description                                                                                                            |
| ---- | ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| 6001 | `atc`              | Live aircraft-tracking frontend (airplanes.live), TypeScript/Express server + static map UI                            |
| 6002 | `ev-crossover`     | Electricity price (€/kWh) at which charging is cheaper than petrol                                                     |
| 6003 | `dynamic-vs-fixed` | Whether a dynamic (hourly-market) energy contract beats your fixed one, from HomeWizard usage + EnergyZero prices (NL) |

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

## Adding a new app

1. Create `apps/<name>/` with a `Dockerfile`, `package.json`, `server.js`, and a
   `public/` folder (copy `apps/ev-crossover` as a template). It is picked up by
   the workspace automatically.
2. Have the server listen on `process.env.PORT` and bind `0.0.0.0`.
3. Add a service to the root `docker-compose.yml` on the next free port (6003, 6004…).
