# PR to dev

**Use whenever** opening a PR that merges a feature/fix/etc. branch into
`dev`. For a `dev` → `main` release PR, use the separate `pr-dev-to-main`
skill instead — the two directions use different merge strategies.

## Process

1. Make sure the compare branch is pushed and up to date with its remote.
2. Fill in the PR using `.github/PULL_REQUEST_TEMPLATE.md`'s sections
   (Summary, What Changed, Screenshots/Demo, What, Why, How, Testing,
   Pre-Merge Checklist) — see field rules below.
3. Open it directly: `gh pr create --base dev --head <branch> --title "..."
--body "..."`.
4. Recommend label(s) and note the Milestone / Development (linked issues)
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
