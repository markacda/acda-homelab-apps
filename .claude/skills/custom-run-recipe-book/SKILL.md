---
name: run-recipe-book
description: Build, run, and drive the recipe-book app (recipe library + book assembly + LaTeX/PDF export on port 6005). Use when asked to start recipe-book, run it, add recipes, generate a book, screenshot its UI, or verify a change in the running app.
---

The repo's reference DDD app: a recipe library (Allerhande import or manual),
named books assembled from recipes, and `.tex`/`.pdf` export. Start the dev
server, smoke the API with `curl`, and drive the UI with
`.claude/ui-helper/ui-driver.mjs` (repo-root path) — a dependency-free CDP
driver using local Chrome/Edge.

All commands run from the **repo root**.

## Setup + Build

```sh
npm install                     # once per clone
npm run build -w recipe-book    # required: Web/public/app.js is gitignored
```

## Run (agent path)

```sh
npm run dev -w recipe-book &
for i in $(seq 1 30); do curl -sf http://localhost:6005/healthz >/dev/null && break; sleep 1; done
```

API smoke — create a recipe, put it in a book, generate + download the `.tex`
(no LaTeX toolchain needed for `.tex`):

```sh
curl -s -X POST http://localhost:6005/api/recipes -H "Content-Type: application/json" \
  -d '{"title":"Skill-check pancakes","ingredients":["250 g flour","500 ml milk","2 eggs"],"steps":["Mix the batter","Bake in a hot pan"]}'
# → 201 with {"id":"<RID>",...,"ingredients":["250 g flour",...]}

BOOK=$(curl -s -X POST http://localhost:6005/api/books -H "Content-Type: application/json" -d '{"name":"Skill check book"}')
BID=$(echo "$BOOK" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
curl -s -X PATCH "http://localhost:6005/api/books/$BID" -H "Content-Type: application/json" -d '{"recipeIds":["<RID>"]}'
curl -s -X POST "http://localhost:6005/api/books/$BID/generate" -H "Content-Type: application/json" -d '{"format":"tex"}'
# → {"format":"tex","url":"api/books/<BID>/download/tex","recipeCount":1}
curl -s "http://localhost:6005/api/books/$BID/download/tex" | head -c 300   # LaTeX source
```

UI smoke — the created recipe must appear in the Library:

```sh
node .claude/ui-helper/ui-driver.mjs <<'EOF'
nav http://localhost:6005/
wait text=Skill-check pancakes
eval document.body.innerText.slice(0, 300)
shot recipe-book.png
errors
EOF
```

Expected: "Library (N)" with the recipe card, plus "Recipe books" and
"Categories" panels. Screenshots land in `.claude/ui-helper/.ui-shots/`;
driver command reference is in the header of `.claude/ui-helper/ui-driver.mjs`.

Clean up test data when done (`DELETE` returns 204):

```sh
curl -s -X DELETE "http://localhost:6005/api/books/$BID" -o /dev/null -w "%{http_code}\n"
curl -s -X DELETE "http://localhost:6005/api/recipes/<RID>" -o /dev/null -w "%{http_code}\n"
```

Stop (Windows):

```powershell
Get-NetTCPConnection -LocalPort 6005 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

## Run (human path)

```sh
npm run dev -w recipe-book   # → http://localhost:6005, Ctrl-C to stop
```

## Test

```sh
npm test -w recipe-book
```

## Gotchas

- **`ingredients`/`steps` are plain string arrays** — objects like
  `{"name":"flour","quantity":"250 g"}` are silently coerced away and you get
  `"ingredients":[]` back (the mapper runs `toStringArray`). The request still
  returns 201, so check the echoed body.
- **PDF generation requires the `tectonic` binary on PATH** — without it,
  `{"format":"pdf"}` returns
  `{"error":"PDF generation needs the 'tectonic' LaTeX engine, which is not installed on this host."}`.
  `.tex` generation always works; use it for smoke tests.
- **Data persists between runs** — dev `DATA_DIR` defaults to
  `apps/recipe-book/data/` (gitignored: `recipes/`, `books/`, `output/`).
  Delete your test recipe/book via the API afterwards to keep it clean.
- **Allerhande import (`POST /api/recipes/import`) needs internet** and a real
  `ah.nl` recipe URL; prefer manual `POST /api/recipes` for smoke tests.
- **`node --watch` lingers after the port kill** — prints "Waiting for file
  changes…", does not respawn; kill it or ignore it.
