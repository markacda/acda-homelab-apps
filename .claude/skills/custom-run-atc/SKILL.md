---
name: run-atc
description: Build, run, and drive the atc app (live aircraft map on port 6001, tar1090-derived UI + airplanes.live proxy). Use when asked to start atc, run it, screenshot the map, query the aircraft API, or verify a change in the running app.
---

A thin Express proxy to airplanes.live plus a vendored tar1090-derived map UI
(`Web/public`, no client build). Start the dev server, smoke the API with
`curl`, and drive the map headlessly with `.claude/ui-helper/ui-driver.mjs`
(repo-root path) — a dependency-free CDP driver using local Chrome/Edge.

All commands run from the **repo root**. Live aircraft data requires internet
(api.airplanes.live).

## Setup

```sh
npm install        # once per clone; atc has no client build step (Web/public is vendored)
```

## Run (agent path)

```sh
npm run dev -w atc &
for i in $(seq 1 30); do curl -sf http://localhost:6001/healthz >/dev/null && break; sleep 1; done
```

API smoke — live aircraft within 40 nm of Amsterdam (route shape is
`/api/airplanes/:lat/:lon/:radius`):

```sh
curl -s -m 20 "http://localhost:6001/api/airplanes/52.37/4.90/40" | head -c 400
```

Expected: JSON starting `{"ac":[{"hex":...`.

UI smoke — wait for live planes in the sidebar table, select one, read its
detail pane, screenshot:

```sh
node .claude/ui-helper/ui-driver.mjs <<'EOF'
nav http://localhost:6001/
wait document.querySelectorAll("#planesTable tr").length > 5
eval document.querySelectorAll("#planesTable tr")[2].click()
sleep 1000
eval ({cs: document.querySelector("#selected_callsign")?.textContent?.trim(), type: document.querySelector("#selected_icaotype")?.textContent?.trim(), alt: document.querySelector("#selected_altitude1")?.textContent?.trim()})
shot atc-selected.png
errors
EOF
```

Expected: the `eval` prints a real callsign/type/altitude (e.g.
`{"cs":"EZY8171","type":"A319","alt":"39000 ft"}`) and the screenshot shows
the map with plane markers and a left detail pane. Screenshots land in
`.claude/ui-helper/.ui-shots/`; driver command reference is in the header of
`.claude/ui-helper/ui-driver.mjs`.

Stop (Windows):

```powershell
Get-NetTCPConnection -LocalPort 6001 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

## Run (human path)

```sh
npm run dev -w atc   # → http://localhost:6001, Ctrl-C to stop
```

## Test

```sh
npm test -w atc
```

## Gotchas

- **Selectors with spaces don't work in the driver's `click`** — `click` takes
  the first whitespace token only, so `click #planesTable tr:nth-child(3)`
  silently clicks `#planesTable`. Use
  `eval document.querySelectorAll("#planesTable tr")[2].click()` for
  descendant selectors.
- **Don't wait for "Total Aircraft: N"** — the header's Total stays `0` in
  this proxy setup; the sidebar `#planesTable` rows are the reliable
  became-live signal.
- **Expected console errors when a plane is selected** — the detail pane
  fetches a photo from `api.planespotters.net`, which CORS-blocks the
  `http://localhost:6001` origin. Two `errors` entries
  (CORS + `net::ERR_FAILED`) are benign; anything else is real.
- **First data can take a few seconds** — the `wait` on table rows covers the
  airplanes.live round-trip; don't replace it with a short `sleep`.
- **`node --watch` lingers after the port kill** — it prints "Waiting for
  file changes…" and does not respawn; kill it or ignore it.
