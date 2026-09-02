# Pre-commit checks

**Purpose:** run every `(check)`/`(fix)`-labeled VS Code task in
`.vscode/tasks.json` — lint and format, for both `client` and `server` —
to catch and auto-correct issues locally instead of surfacing them later.

**Use whenever:**

- **On request, standalone** — "run the checks", "lint this", "run the CI
  tasks locally" — at any point while working, e.g. mid-task on a larger
  change or when you just want lint + format tidy.

**Not** a pipeline step any more. The `pr-to-dev` / `pr-dev-to-main` finish
pipeline runs `ci-verifier` first (which reports lint/format red) and then
`ci-fixer-agent` (which fixes it) — this skill is no longer wired in
between. A plain `commit` / `git push` still has no lint/format gate.

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

## Windows CRLF false-diff

The repo's `.gitattributes` (`* text=auto eol=lf`) checks every text file
out as LF on every platform, so `npm run format` and `git status` no
longer disagree with CI over line endings. If you still see a big
unrelated `git status` after the fix tasks (a working tree that predates
`.gitattributes`, a fresh clone mid-migration): stage then unstage to
normalize the comparison —

```sh
git add -A
git status --short   # compare against this, not the pre-stage listing
git restore --staged .
```

— and only files still showing modified are real. Don't stage or "fix"
the line-ending-only set.

## Scope — deliberately narrow

This runs only the tasks in `.vscode/tasks.json` whose label contains
`(check)` or `(fix)` — lint and format. It does **not** run tests or the
production build (the other jobs bundled into "✅ CI: Verify All") —
`ci-verifier` covers those at PR time. Run them yourself via the matching
VS Code task, `npm test`, or `npm run build` any time you want the extra
confidence.
