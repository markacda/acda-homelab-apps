---
description: Run the repo's CI quality gate locally (format:check, lint, typecheck, test). Use before committing, opening a PR, or when asked to verify the tree is clean.
argument-hint: "[workspace]"
allowed-tools: Bash(npm run format:check*), Bash(npm run format*), Bash(npm run lint*), Bash(npm run typecheck*), Bash(npm test*)
---

# Local CI quality gate

Run the same checks as `.github/workflows/ci.yml`, from the repo root.

Workspace argument: `$1` (empty = whole repo).

## Steps

Run **all four** checks even if an earlier one fails — the goal is a complete
picture, not fail-fast:

1. `npm run format:check` — always repo-wide (Prettier runs on `.`; no `-w` support).
2. `npm run lint` — always repo-wide (ESLint runs on `.`; no `-w` support).
3. `npm run typecheck` — if `$1` is given, scope it: `npm run typecheck -w $1`.
4. `npm test` — if `$1` is given, scope it: `npm test -w $1`.

Workspace names are npm package names (e.g. `ev-crossover`, `@homelab/access-log`) —
see the root `package.json` `workspaces` list.

## Reporting

After all four have run, summarize per check: pass, or the failures (file + message,
condensed). Then:

- If Prettier failed: offer to run `npm run format` to autofix.
- If ESLint reported autofixable issues: offer to run `npm run lint:fix`.
- Typecheck/test failures need real fixes — list them; don't auto-fix without being asked.

Exit with a clear one-line verdict: **all green** or **N of 4 checks failed**.
