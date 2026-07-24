---
name: run-dynamic-vs-fixed
description: Build, run, and drive the dynamic-vs-fixed app (dynamic vs fixed energy contract comparison on port 6003). Use when asked to start dynamic-vs-fixed, run it, test the CSV calculation, screenshot its UI, or verify a change in the running app.
---

A stateless calculation pipeline: upload a HomeWizard CSV export + tariff
params, get a fixed-vs-dynamic cost comparison priced with live EnergyZero
data. Start the dev server, smoke the API with `curl -F`, and drive the UI
with `.claude/ui-helper/ui-driver.mjs` (repo-root path) — a dependency-free
CDP driver using local Chrome/Edge.

All commands run from the **repo root**. The calculation fetches EnergyZero
prices for the CSV's dates, so it needs internet.

## Setup + Build

```sh
npm install                          # once per clone
npm run build -w dynamic-vs-fixed    # required: Web/public/app.js is gitignored
```

## Run (agent path)

```sh
npm run dev -w dynamic-vs-fixed &
for i in $(seq 1 30); do curl -sf http://localhost:6003/healthz >/dev/null && break; sleep 1; done
```

Make a minimal HomeWizard-style CSV (cumulative meter readings, `;`-separated,
`Europe/Amsterdam` local times — use past dates so EnergyZero has prices).
Write it to a **repo-relative** path — the driver is a Windows node process,
so shell-only paths like `/tmp` don't resolve for it; the gitignored
`.claude/ui-helper/tmp-files/` scratch dir works for both:

```sh
mkdir -p .claude/ui-helper/tmp-files
cat > .claude/ui-helper/tmp-files/homewizard-sample.csv <<'EOF'
Time;Import T1;Import T2;Gas
2025-01-06 00:00;100.0;200.0;500.0
2025-01-06 01:00;100.5;200.0;500.2
2025-01-06 08:00;100.5;201.0;500.2
2025-01-06 09:00;101.0;202.0;500.5
EOF
```

API smoke — multipart `csv` file + `params` JSON string field:

```sh
curl -s -m 60 -F "csv=@.claude/ui-helper/tmp-files/homewizard-sample.csv" \
  -F 'params={"fixedDayTariff":0.40,"fixedNightTariff":0.30,"fixedGasPrice":1.20,"includeGas":true,"elecEnergyTax":0.1088,"gasEnergyTax":0.57816,"elecMarkup":0.02,"gasMarkup":0.05,"vatPct":21,"dayStartHour":7,"dayEndHour":23,"weekendAllNight":true}' \
  http://localhost:6003/api/calculate | head -c 600
```

Expected: JSON starting `{"result":{"coverage":...` with an `annual` block.

UI smoke — upload the CSV, calculate, read the verdict, screenshot:

```sh
node .claude/ui-helper/ui-driver.mjs <<'EOF'
nav http://localhost:6003/
wait text=Dynamic vs Fixed
upload #csv .claude/ui-helper/tmp-files/homewizard-sample.csv
click #submitBtn
wait document.querySelector("#verdict")?.textContent?.length > 0
eval document.querySelector("#verdict")?.textContent
eval document.querySelector("#annualDiff")?.textContent
shot dynamic-vs-fixed.png
errors
EOF
```

Expected: verdict like `"✅ A dynamic contract would have been cheaper"` and a
`€` amount. Screenshots land in `.claude/ui-helper/.ui-shots/`; driver command
reference is in the header of `.claude/ui-helper/ui-driver.mjs`.

Stop (Windows):

```powershell
Get-NetTCPConnection -LocalPort 6003 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

## Run (human path)

```sh
npm run dev -w dynamic-vs-fixed   # → http://localhost:6003, Ctrl-C to stop
```

## Test

```sh
npm test -w dynamic-vs-fixed
```

## Gotchas

- **`<script>` must be `type="module"`** — the client tsconfig emits ESM
  (`export {};` trailer, because the root package.json is `"type": "module"`),
  so a plain `<script src="app.js">` in `Web/public/index.html` dies with
  `SyntaxError: Unexpected token 'export'` and the whole UI goes dead
  (Calculate does nothing). This bit once; if the UI is inert, check
  `errors` in the driver output for exactly this exception.
- **File inputs need the driver's `upload` command** — `fill #csv <path>`
  cannot set a file input (browser security); `upload #csv <path>` uses CDP
  `DOM.setFileInputFiles`.
- **Don't pass `/tmp/...` paths to `upload`** — the driver is a Windows node
  process and resolves them to `C:\tmp\...` (`no such file`). Use
  repo-relative paths under `.claude/ui-helper/tmp-files/`.
- **The page text is English** ("Dynamic vs Fixed contract") even though the
  proxy path is Dutch (`/dynamisch-of-vast`); amounts render with locale
  commas (`€0,34`).
- **`node --watch` lingers after the port kill** — prints "Waiting for file
  changes…", does not respawn; kill it or ignore it.
