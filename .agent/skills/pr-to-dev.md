# PR to dev

**Use whenever** opening a PR that merges a feature/fix/etc. branch into
`dev`. For a `dev` → `main` release PR, use the separate `pr-dev-to-main`
skill instead — the two directions use different merge strategies.

## Process — the locked finish pipeline

Run these in order. This whole sequence is the "session is finished, open a
PR" pipeline — none of it (`ci-verifier`, `ci-fixer-agent`, `code-reviewer`,
`workflow-doc-sync`) runs earlier, on a plain `commit` or `git push`. The
`golden-fur` `session-router` hook injects this same list when it sees a
"open a PR" prompt; the `pr-guard` hook blocks `gh pr create` until steps 2
and 4 have left their evidence.

1. **Branch.** If `HEAD` is `dev` (or `main`), run
   `.agent/skills/branch-naming.md` to create and push the feature/fix
   branch first. Uncommitted work is expected here — it's committed at
   step 7.
2. **Verify CI parity across both repos** — spawn the `ci-verifier` subagent
   (`.agent/agents/ci-verifier.md`) against the working tree; tests, lint,
   format, build, both repos, all green. It writes `.git/ci-verifier-pass`
   (the verified `HEAD` sha) on success — `pr-guard` checks that. A green
   pass from earlier this session with nothing changed since counts.
3. **If `ci-verifier` came back red — spawn `ci-fixer-agent`**
   (`.agent/agents/ci-fixer-agent.md`) to fix format/lint/build/test
   failures without weakening any check, then **re-run `ci-verifier`** until
   green. (`ci-fixer-agent` also does what `pre-commit-checks` used to do at
   PR time — no separate `pre-commit-checks` step here.)
4. **Unbiased code review of the whole branch** — spawn `code-reviewer`
   (`.agent/agents/code-reviewer.md`, trigger `pre-pr`) on the full
   `dev...HEAD` diff + working tree. Read-only; files its report into the
   session's own
   `../golden-fur-vault/Projects/golden-fur/sessions/<NN-slug>/reviews/`.
   Resolve every **Blocking** finding (edits happen here); fold anything
   still worth noting into the PR's **Testing**/**How** sections. A pass
   from earlier this session with nothing changed under `client/src` /
   `server/src` / `supabase/` since counts.
5. **Workflow-doc drift** — if the branch touched `client/src` /
   `server/src` / `supabase/migrations` and `workflow-doc-sync` hasn't run
   this session, run it once over the whole `dev...HEAD` diff. It detects
   drift and hands off to the vault's `workflow-documenter`; note candidates
   in the PR's **How** section.
6. **Session record** — confirm
   `../golden-fur-vault/Projects/golden-fur/sessions/<NN-slug>/` has this
   session's `plan.md` + `testing/testing.md` and they're current. If the
   session doc was never written (or is stale), spawn `session-documenter`
   now. Normally it already ran at implementation-finish (the `Stop` hook
   nudges it) — this is a backstop.
7. **Commit** — run `.agent/skills/commit.md` for `golden-fur`. One commit
   captures the implementation + `ci-fixer-agent` fixes + `code-reviewer`
   fixes. (An extra commit right after step 3 is fine if the review is
   expected to be large.)
8. **Push** the branch.
9. Fill in the PR using `.github/PULL_REQUEST_TEMPLATE.md`'s sections
   (Summary, What Changed, Screenshots/Demo, What, Why, How, Testing,
   Pre-Merge Checklist) and open it:
   `gh pr create --base dev --head <branch> --title "..." --body "..."`.
10. Recommend label(s) and note the Milestone / Development (linked issues)
    fields — GitHub sidebar fields, set with `gh pr edit --add-label ...`
    or left for the user.
11. **Vault side** — commit + push the `golden-fur-vault` changes this
    session produced (`sessions/NN-<slug>/`, any `Reference/golden-fur/` workflow refresh) and
    open the vault PR with the `pr` skill there. The vault's own
    `ci-verifier` + `pr-guard` gate that PR.

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
