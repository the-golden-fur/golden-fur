# Pre-commit checks

**Purpose:** run every `(check)`/`(fix)`-labeled VS Code task in
`.vscode/tasks.json` — lint and format, for both `client` and `server` —
before code gets committed, so issues are caught and auto-corrected
locally instead of surfacing later in CI or needing manual cleanup after
the fact.

**Use whenever:**

- **Always, as the first step of the `commit` skill** — run this before
  staging/writing the commit message, every time a local commit is made in
  this repo.
- On request, standalone — "run the checks", "lint this", "run the CI
  tasks locally" — at any other point while working, e.g. mid-task on a
  larger change.

## Process

1. **Run the fix tasks first**, so trivially-fixable issues are corrected
   automatically rather than reported as failures to work around by hand:
   - `npm run format` (repo root) — Prettier write; matches "🎨 Format: Fix
     (write)".
   - `npm --prefix client run lint:fix` — matches "🔧 Client: Lint (fix)".
   - `npm --prefix server run lint:fix` — matches "🔧 Server: Lint (fix)".
2. **Run the check tasks** to confirm a clean state and catch anything the
   fixers couldn't resolve automatically:
   - `npm run format:check` (repo root) — matches "🎨 Format: Check".
   - `npm --prefix client run lint` — matches "🔍 Client: Lint (check)".
   - `npm --prefix server run lint` — matches "🔍 Server: Lint (check)".
3. **If a check still fails after its matching fix task ran**, that's a
   real issue (a lint rule with no auto-fix, a formatting conflict, etc.)
   — surface the failing file(s) and message to the user before
   committing. Don't silently hand-patch lint errors to force a pass
   unless asked to; report what failed and where, and let the user decide
   whether to fix it now or commit anyway.
4. Only proceed to stage/commit once every check task passes clean, or the
   user explicitly says to commit anyway with known issues outstanding.

## Scope — deliberately narrow

This runs only the tasks in `.vscode/tasks.json` whose label contains
`(check)` or `(fix)` — lint and format. It does **not** run tests or the
production build (the other jobs bundled into "✅ CI: Verify All") —
those are slower, and already covered by CI on the PR itself. Run them
yourself via the matching VS Code task, `npm test`, or `npm run build` if
you want that extra confidence before pushing, but they're not part of
this pre-commit gate.
