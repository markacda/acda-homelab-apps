# acda-homelab-apps

A monorepo of small Node webapps that run in Docker on a Raspberry Pi 5 (ARM64),
each on its own port, all aggregated by a single `docker-compose.yml`.

## Port map

| Port | App            | Description                                                        |
| ---- | -------------- | ------------------------------------------------------------------ |
| 6001 | _(other app)_  | already in use                                                     |
| 6002 | `ev-crossover` | Electricity price (€/kWh) at which charging is cheaper than petrol |
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

## Run a single app locally (dev)

```sh
cd apps/ev-crossover
npm install
npm start          # serves on http://localhost:6002
```

## Adding a new app

1. Create `apps/<name>/` with a `Dockerfile`, `package.json`, `server.js`, and a
   `public/` folder (copy `apps/ev-crossover` as a template).
2. Have the server listen on `process.env.PORT` and bind `0.0.0.0`.
3. Add a service to the root `docker-compose.yml` on the next free port (6003, 6004…).
