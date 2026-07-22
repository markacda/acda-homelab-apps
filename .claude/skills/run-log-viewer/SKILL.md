---
name: run-log-viewer
description: Build, run, and drive the log-viewer app (access/app-log analytics UI on port 6004). Use when asked to start log-viewer, run it, point it at logs, screenshot its stats UI, or verify a change in the running app.
---

A read-only analytics app: ingests every app's structured `access.log` /
`app.log` under `LOGS_ROOT` and serves a stats/browse UI. Start the dev
server pointed at the repo's dev logs, smoke `/api/meta` with `curl`, and
drive the UI with `.claude/ui-helper/ui-driver.mjs` (repo-root path) — a
dependency-free CDP driver using local Chrome/Edge.

All commands run from the **repo root**.

## Setup + Build

```sh
npm install                   # once per clone
npm run build -w log-viewer   # required: Web/public/app.js is gitignored
```

Data to view: in dev, each app writes logs to `apps/<name>/logs/` — running
any other app of this repo (even just its `/` page + curl) produces entries.

## Run (agent path)

`LOGS_ROOT` must be an **absolute** path (see Gotchas):

```sh
LOGS_ROOT="$(pwd -W 2>/dev/null || pwd)/apps" npm run dev -w log-viewer &
for i in $(seq 1 45); do curl -sf http://localhost:6004/healthz >/dev/null && break; sleep 1; done
```

API smoke — proves ingestion found entries:

```sh
curl -s "http://localhost:6004/api/meta"           # {"apps":["atc",...],"count":7537,...}
curl -s "http://localhost:6004/api/logs?limit=2"   # newest entries
```

UI smoke — the app is hash-routed; open the requests view, wait for the
stats tables, screenshot:

```sh
node .claude/ui-helper/ui-driver.mjs <<'EOF'
nav http://localhost:6004/#/requests
wait document.querySelectorAll("table tr").length > 3
eval document.body.innerText.slice(0, 200)
shot log-viewer-requests.png
errors
EOF
```

Expected: innerText shows "N requests · updated <timestamp>" plus stat tiles
(Total requests, Avg response time, Errors); the screenshot shows per-app and
per-endpoint tables. Screenshots land in `.claude/ui-helper/.ui-shots/`;
driver command reference is in the header of `.claude/ui-helper/ui-driver.mjs`.

Stop (Windows):

```powershell
Get-NetTCPConnection -LocalPort 6004 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

## Run (human path)

```sh
LOGS_ROOT="$(pwd -W 2>/dev/null || pwd)/apps" npm run dev -w log-viewer   # → http://localhost:6004
```

## Test

```sh
npm test -w log-viewer
```

## Gotchas

- **The README's `LOGS_ROOT=./apps` loads 0 entries** — `npm run dev -w`
  runs with the *workspace* dir as cwd (`apps/log-viewer/`), so `./apps`
  resolves to `apps/log-viewer/apps` (missing) and ingest silently reports
  `[ingest] loaded 0 requests`. Always pass an absolute path; on Git Bash for
  Windows use `$(pwd -W)` so node gets `C:/...` rather than `/c/...`.
- **Zero entries is silent at the HTTP layer** — `/healthz` and `/api/meta`
  respond fine with `"count":0`; check the server's `[ingest] loaded N`
  stderr line or `/api/meta`'s count to confirm the root is right.
- **Routes are hash-based** — `#/requests` and `#/logs`; there is no
  server-side route for them, so `nav http://localhost:6004/#/requests`
  is the way in.
- **`node --watch` lingers after the port kill** — prints "Waiting for file
  changes…", does not respawn; kill it or ignore it.
