---
name: run-dashboard
description: Build, run, and drive the dashboard app (homelab landing page with Docker auto-discovery and health tiles on port 6000). Use when asked to start the dashboard, run it, screenshot its tiles, or verify a change in the running app.
---

The homelab landing page: auto-discovers Docker containers (via the Docker
socket) and health-checks them, merged with manual tiles from
`apps/dashboard/config/config.yaml`. Start the dev server, smoke `/api/apps`
with `curl`, and drive the UI with `.claude/ui-helper/ui-driver.mjs`
(repo-root path) — a dependency-free CDP driver using local Chrome/Edge.

All commands run from the **repo root**.

## Setup + Build

```sh
npm install                   # once per clone
npm run build -w dashboard    # required: Web/public/app.js is gitignored
```

## Run (agent path)

```sh
npm run dev -w dashboard &
for i in $(seq 1 30); do curl -sf http://localhost:6000/healthz >/dev/null && break; sleep 1; done
```

API smoke:

```sh
curl -s http://localhost:6000/api/apps
# → {"title":"Acda Homelab","apps":[{"name":"Home Assistant",...,"status":"down",...}]}
```

UI smoke:

```sh
node .claude/ui-helper/ui-driver.mjs <<'EOF'
nav http://localhost:6000/
wait text=Acda Homelab
sleep 1500
eval document.body.innerText.slice(0, 250)
shot dashboard.png
errors
EOF
```

Expected: header "Acda Homelab · N app(s) · M up" with a tile per app.
Screenshots land in `.claude/ui-helper/.ui-shots/`; driver command reference
is in the header of `.claude/ui-helper/ui-driver.mjs`.

Stop (Windows):

```powershell
Get-NetTCPConnection -LocalPort 6000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

## Run (human path)

```sh
npm run dev -w dashboard   # → http://localhost:6000, Ctrl-C to stop
```

## Test

```sh
npm test -w dashboard
```

## Gotchas

- **Chrome refuses port 6000 (`ERR_UNSAFE_PORT`)** — 6000 is on Chrome's
  restricted-port list (X11). `curl` works, the browser doesn't. The driver
  already passes `--explicitly-allowed-ports=6000`; if you drive this app any
  other way (Playwright, manual Chrome), you must add that flag yourself.
- **No Docker Desktop → discovery degrades, doesn't fail** — the server logs
  `[discovery] Cannot reach Docker socket: connect ENOENT //./pipe/docker_engine`
  and shows only the manual `apps:` entries from
  `apps/dashboard/config/config.yaml` (on this machine: one Home Assistant
  tile, status `down`). `/healthz` and the UI stay fine.
- **Health checks probe `hostAddress` from config.yaml**
  (`host.docker.internal`) — in local dev without the Docker stack those
  probes fail, so tiles show red/down. That's expected, not a regression.
- **`node --watch` lingers after the port kill** — prints "Waiting for file
  changes…", does not respawn; kill it or ignore it.
