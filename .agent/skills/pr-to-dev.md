# PR to dev

**Use whenever** opening a PR that merges a feature/fix/etc. branch into
`dev`. For a `dev` → `main` release PR, use the separate `pr-dev-to-main`
skill instead — the two directions use different merge strategies.

## Process

1. **Run `.agent/skills/pre-commit-checks.md`** — lint + format fix/check
   for `client` and `server`, so `ci-verifier` (read-only, won't fix) has
   nothing trivial to fail on. Commit any fixes it makes.
2. Make sure the compare branch is pushed and up to date with its remote.
3. **Verify CI parity across both repos** — spawn the `ci-verifier`
   subagent (`.agent/agents/ci-verifier.md`); everything (tests, lint,
   format, build, both repos) must be green before the PR is opened. A
   green pass from earlier this session with nothing changed since counts.
4. **Run an unbiased code review of the whole branch** — spawn the
   `code-reviewer` subagent (`.agent/agents/code-reviewer.md`, trigger
   `pre-pr`) on the full `dev...HEAD` diff. It is read-only and files its
   report under
   `../golden-fur-vault/Projects/golden-fur/testing/reviews/<branch>/`.
   Resolve every **Blocking** finding before opening the PR; fold anything
   still worth noting into the PR's **Testing**/**How** sections. If
   `code-reviewer` already ran on this branch earlier in the session and
   nothing has changed under `client/src`, `server/src`, or `supabase/`
   since, that pass counts — no new pass needed.
5. **Check workflow-doc drift** — if the branch touched `client/src` /
   `server/src` / `supabase/migrations`, run the `workflow-doc-sync` skill
   once over the whole `dev...HEAD` diff. It only detects drift and hands
   off to the vault's `workflow-documenter`; note any candidates in the
   PR's **How** section. (This is the only point it runs — not per commit.)
6. Fill in the PR using `.github/PULL_REQUEST_TEMPLATE.md`'s sections
   (Summary, What Changed, Screenshots/Demo, What, Why, How, Testing,
   Pre-Merge Checklist) — see field rules below.
7. Open it directly: `gh pr create --base dev --head <branch> --title "..."
--body "..."`.
8. Recommend label(s) and note the Milestone / Development (linked issues)
   fields — these are GitHub sidebar fields, not part of the body; set them
   with `gh pr edit --add-label ...` or leave them for the user to set in
   the UI if `gh` in this environment can't reach them.

## Merge strategy: squash only

This direction is **squash merge only** — `dev`'s history stays one
squashed commit per feature/fix branch. When actually merging (only when
asked): `gh pr merge <PR> --squash`. Never `--rebase` or `--merge` here.
Merge commit message: `<type>(<scope>): <subject> (#<PR number>)`.

## Rules

### PR Title

Mirrors the commit subject format: `<type>(<scope>): <subject>`, max 72
characters, imperative mood, no trailing period.

### Labels

`feature`, `bug`, `hotfix`, `chore`, `refactor`, `docs`, `test`, `breaking`.

### Milestone

Format `<Sprint name> — <focus area>` (e.g. `Sprint 2 — Appointment
Booking`); use `Backlog` if unassigned.

### Development (linked issues)

`Closes #<issue>` — one per line if multiple.

### Body sections

- **Summary** — one sentence, what + why, written for someone scanning a
  PR list.
- **What Changed** — brief bullet list of key files/components touched and
  why; not exhaustive.
- **What** — one sentence: what this PR introduces or changes.
- **Why** — one sentence: what problem it solves, why now.
- **How** — bullet list of key implementation decisions/trade-offs (the
  section a commit body skips, because reviewers need this before
  approving and the diff doesn't explain intent).
- **Testing** — how it was verified: manual steps, automated tests, edge
  cases.

## General rules

- PRs must be atomic — one concern per PR.
- Request at least one reviewer before merging; don't merge your own PR
  without review except in emergencies.
- Never merge without being explicitly asked to.
