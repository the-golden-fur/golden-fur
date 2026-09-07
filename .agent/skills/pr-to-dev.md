# PR to dev

**Use whenever** opening a PR that merges a feature/fix/etc. branch into
`dev`. For a `dev` → `main` release PR, use the separate `pr-dev-to-main`
skill instead — the two directions use different merge strategies.

## Process — the locked finish pipeline

Run these in order. This whole sequence is the "session is finished, open a
PR" pipeline — none of it (`ci-verifier`, `ci-fixer-agent`, the `code-review`
pass) runs earlier, on a plain `commit` or `git push`. The `golden-fur`
`session-router` hook injects this same list when it sees an "open a PR"
prompt; the `pr-guard` hook blocks `gh pr create` until steps 2 and 4 have
left their evidence.

1. **Branch.** If `HEAD` is `dev` (or `main`), run
   `.agent/skills/branch-naming.md` to create and push the feature/fix
   branch first. Uncommitted work is expected here — it's committed at
   step 6.
2. **Verify CI parity across both repos** — spawn the `ci-verifier` subagent
   (`.agent/agents/ci-verifier.md`) **once** against the working tree;
   tests, lint, format, build, both repos, all green. It writes
   `.git/ci-verifier-pass` (the verified `HEAD` sha) on success — `pr-guard`
   checks that. A green pass from earlier this session with nothing changed
   since counts.
3. **If `ci-verifier` came back red — spawn `ci-fixer-agent`**
   (`.agent/agents/ci-fixer-agent.md`) to fix format/lint/build/test
   failures without weakening any check, then **re-run `ci-verifier`** until
   green. (`ci-fixer-agent` also does what `pre-commit-checks` used to do at
   PR time — no separate `pre-commit-checks` step here.)
4. **Code review of the whole branch** — invoke the built-in `code-review`
   skill (`Skill(code-review, "high")`) **in-session** on the full
   `dev...HEAD` diff + working tree. Do **not** spawn a review subagent.
   Resolve every **Blocking** finding (edits happen here); fold anything
   still worth noting into the PR's **Testing**/**How** sections. Then write
   a short findings summary (verdict + blocking count + notes actioned) to
   `../golden-fur-vault/Projects/golden-fur/sessions/<NN-slug>/reviews/<YYYY-MM-DD-HHmm>-pre-pr.md`
   — `pr-guard` requires a file in that folder before it lets the PR open.
   A review from earlier this session with nothing changed under
   `client/src` / `server/src` / `supabase/` since counts.
5. **Session record** — confirm
   `../golden-fur-vault/Projects/golden-fur/sessions/<NN-slug>/` has this
   session's `plan.md` + `testing/testing.md` and they're current. It
   normally already exists — `session-documenter` runs at
   implementation-finish. If it was never written (or is stale), **stop and
   ask the user to run `session-documenter`** before retrying — do not spawn
   it inside the PR flow.
6. **Commit** — run `.agent/skills/commit.md` for `golden-fur`. One commit
   captures the implementation + `ci-fixer-agent` fixes + code-review fixes.
   (An extra commit right after step 3 is fine if the review is expected to
   be large.)
7. **Push** the branch.
8. **Open the PR with every field set — never leave the title, body,
   assignee, or labels for the user to fill in.** Write the body from
   `.github/PULL_REQUEST_TEMPLATE.md`'s sections (Summary, What Changed,
   Screenshots/Demo, What, Why, How, Testing, Pre-Merge Checklist) to a
   file, pick the label(s) from the **Labels** rule below, then
   `gh pr create --base dev --head <branch> --title "<type>(<scope>): <subject>" --body-file <file> --assignee @me --label <label>[,<label>]`.
   - **A PR for this branch usually already exists** — this repo auto-opens
     an empty one on first push, so `gh pr create` will error with the
     number. Apply the same fields to that PR instead:
     `gh pr edit <n> --title "..." --body-file <file> --add-assignee @me --add-label <label>`,
     then confirm with `gh pr view <n> --json title,assignees,labels`.
   - Assignee is `@me` unless the user explicitly named someone else.
   - Create a missing label first with `gh label create`.
9. **Milestone + linked issues** — set on the same PR, not handed back as a
   suggestion. Milestone: `gh pr edit <n> --milestone "<name>"` (format in
   the **Milestone** rule); only skip it when the repo genuinely has no
   matching milestone, and say so when you hand back the PR link. Linked
   issues: a `Closes #<n>` line per issue in the body.
10. **Vault side** — commit + push the `golden-fur-vault` changes this
    session produced (`sessions/NN-<slug>/`) and open the vault PR with the
    `pr` skill there. Reuse step 2's green `ci-verifier` pass — don't spawn
    `ci-verifier` again for the vault PR.

**Workflow-doc drift** (`workflow-doc-sync`) is no longer a pipeline step —
it spawned a subagent (sometimes two) every PR. Run it by hand when you
actually want the drift check.

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
