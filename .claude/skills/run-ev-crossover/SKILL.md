---
name: run-ev-crossover
description: Build, run, and drive the ev-crossover app (EV vs petrol crossover-price calculator on port 6002). Use when asked to start ev-crossover, run it, test it, screenshot its UI, or verify a change in the running app.
---

A static calculator page (no server-side domain): fill four inputs, get the
electricity price at which charging beats petrol. Start the dev server, then
drive the page headlessly with `.claude/ui-helper/ui-driver.mjs` (repo-root
path) — a dependency-free CDP driver that uses the locally installed
Chrome/Edge.

All commands run from the **repo root**.

## Setup + Build

```sh
npm install                     # once per clone (root lockfile, all workspaces)
npm run build -w ev-crossover   # required: Web/public/*.js client bundles are gitignored
```

Without the build the page loads but is inert — `app.js`/`crossover.js` won't exist.

## Run (agent path)

Start the dev server in the background, then poll health:

```sh
npm run dev -w ev-crossover &
# poll until ready (don't sleep blind):
for i in $(seq 1 30); do curl -sf http://localhost:6002/healthz >/dev/null && break; sleep 1; done
```

Drive one real flow — fill the form, read the crossover price, screenshot:

```sh
node .claude/ui-helper/ui-driver.mjs <<'EOF'
nav http://localhost:6002/
wait text=EV vs Petrol
fill #petrolPrice 2.10
fill #consumption 5.5
fill #capacity 60
fill #range 420
click #calc
sleep 300
eval document.querySelector('#resultValue')?.textContent
shot ev-crossover.png
errors
EOF
```

Expected: the `eval` prints `"€2.673"` for these inputs. Screenshots land in
`.claude/ui-helper/.ui-shots/` (gitignored); each `shot` prints the absolute
path. Driver command reference: header comment of `.claude/ui-helper/ui-driver.mjs`.

Stop (Windows — kill whatever listens on the port):

```powershell
Get-NetTCPConnection -LocalPort 6002 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

## Run (human path)

```sh
npm run dev -w ev-crossover   # → http://localhost:6002, Ctrl-C to stop
```

## Test

```sh
npm test -w ev-crossover      # node --test, all pass in <1s
```

## Gotchas

- **`wait text=` marker** — the page is English ("EV vs Petrol crossover"),
  even though the proxy path is Dutch (`/laden-of-tanken`). Don't wait for
  Dutch text.
- **`node --watch` lingers after the port kill** — killing the port listener
  stops the server, but the npm/`node --watch` wrapper stays alive printing
  "Waiting for file changes before restarting…". It does **not** respawn the
  server; kill it or ignore it.
- **Decimal input** — `fill #petrolPrice 2.10` works; the UI re-renders the
  value with a locale comma (`2,10`). That's display only, the math is fine.
