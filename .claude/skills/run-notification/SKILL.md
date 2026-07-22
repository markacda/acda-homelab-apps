---
name: run-notification
description: Build, run, and drive the notification app (notification feed + pluggable delivery channels on port 6006). Use when asked to start notification, run it, post a test notification, screenshot the feed, or verify a change in the running app.
---

A notifications hub: `POST /send` records every notification in a file-backed
feed and optionally fans out to named delivery channels; a small web UI shows
the recent feed. Start the dev server, smoke it with `curl`, and drive the
feed UI with `.claude/ui-helper/ui-driver.mjs` (repo-root path) — a
dependency-free CDP driver using local Chrome/Edge.

All commands run from the **repo root**.

## Setup + Build

```sh
npm install                      # once per clone
npm run build -w notification    # required: Web/public/app.js is gitignored
```

## Run (agent path)

```sh
npm run dev -w notification &
for i in $(seq 1 30); do curl -sf http://localhost:6006/healthz >/dev/null && break; sleep 1; done
```

API smoke — post to the feed, read it back, and confirm the unknown-channel
guard:

```sh
curl -s -X POST http://localhost:6006/send -H "Content-Type: application/json" \
  -d '{"title":"Smoke test","message":"Sent by the run-notification skill check","app":"skill-check"}'
# → {"id":"<uuid>","createdAt":"...","title":"Smoke test",...}

curl -s "http://localhost:6006/api/notifications?limit=3"
# → {"notifications":[{...,"title":"Smoke test",...}]}

curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:6006/send \
  -H "Content-Type: application/json" -d '{"title":"x","message":"y","channels":["nope"]}'
# → 400 ({"error":"unknown channel \"nope\""})
```

UI smoke — the posted notification must appear in the feed:

```sh
node .claude/ui-helper/ui-driver.mjs <<'EOF'
nav http://localhost:6006/
wait text=Smoke test
eval document.body.innerText.slice(0, 250)
shot notification.png
errors
EOF
```

Expected: header "🔔 Notificaties · N notification(s)" with the "Smoke test"
card. Screenshots land in `.claude/ui-helper/.ui-shots/`; driver command
reference is in the header of `.claude/ui-helper/ui-driver.mjs`.

Stop (Windows):

```powershell
Get-NetTCPConnection -LocalPort 6006 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

## Run (human path)

```sh
npm run dev -w notification   # → http://localhost:6006, Ctrl-C to stop
```

## Test

```sh
npm test -w notification
```

## Gotchas

- **The feed persists between runs** — in dev `DATA_DIR` defaults to
  `apps/notification/data/` (gitignored); notifications accumulate in
  `notifications.json` there. Delete that file for a clean slate.
- **`SEND_TOKEN` is optional and off by default in dev** — if set,
  `POST /send` requires it; the smoke calls above assume it's unset.
- **The email channel only exists if `SMTP_HOST` is set** — otherwise
  `channels":["email"]` is an unknown channel (400), which surprises if you
  copy a production payload.
- **`node --watch` lingers after the port kill** — prints "Waiting for file
  changes…", does not respawn; kill it or ignore it.
