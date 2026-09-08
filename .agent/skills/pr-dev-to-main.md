# PR: dev → main

**Use whenever** opening a release/promotion PR that merges `dev` into
`main`. For a feature/fix branch into `dev`, use the separate `pr-to-dev`
skill instead — the two directions use different merge strategies.

## Process

1. Make sure `dev` is up to date and includes everything intended for this
   release/promotion.
2. **Verify CI parity across both repos** — spawn the `ci-verifier`
   subagent (`.agent/agents/ci-verifier.md`) **once** against `dev`; tests,
   lint, format, and build must be green in `golden-fur` and
   `golden-fur-vault` before promoting. If red, spawn `ci-fixer-agent` and
   re-verify until green (same auto-chain as `pr-to-dev`). `ci-verifier`
   writes the `.git/ci-verifier-pass` marker the `pr-guard` hook checks.
3. **Confirm each feature/fix branch merged into `dev` since the last
   promotion was reviewed** at `pre-pr` time — a review file lives under
   that branch's `sessions/<NN-slug>/reviews/` folder. If any branch has no
   review on record, run the `code-review` skill (`Skill(code-review,
"high")`) on that PR's diff now, resolve any **Blocking** findings, and
   drop a short summary into that session's `reviews/` folder before
   promoting. A `dev` → `main` promotion adds no new code, so it needs no
   fresh full-tree review — and no `workflow-doc-sync` pass either.
4. Title/body summarize what's shipping — this can aggregate several
   feature/fix PRs merged into `dev` since the last promotion, not just one
   change. Sections: Summary, What Changed (notable features/fixes since
   the last dev → main promotion), Testing.
5. Open it with every field set — title, body, assignee, label(s) — never
   left for the user:
   `gh pr create --base main --head dev --title "release: ..." --body-file <file> --assignee @me --label <label>`.
   If a `dev → main` PR is already open (this repo auto-opens one), apply
   the same fields with `gh pr edit <n> --title ... --body-file <file> --add-assignee @me --add-label <label>` and confirm with
   `gh pr view <n> --json title,assignees,labels`. Label is usually
   `feature` (or whichever type dominates the promotion); set a milestone
   with `gh pr edit <n> --milestone "<name>"` when one matches.

## Merge strategy: rebase first, merge as fallback — never squash

Squashing here would collapse `dev`'s already-curated, already-reviewed
commit history into a single commit on `main`, throwing away the record
that squash merges into `dev` were specifically preserving.

When actually merging (only when asked):

1. Try `gh pr merge <PR> --rebase` first.
2. Only if GitHub reports the rebase can't be done cleanly (conflicts,
   diverged history), fall back to `gh pr merge <PR> --merge` (an ordinary
   merge commit).
3. Never `--squash` for this direction.

## A repo-settings note worth knowing

GitHub's "allow squash / allow rebase / allow merge" toggles (Settings →
General → Pull Requests) apply repo-wide, not per base branch — you can't
configure GitHub to allow only squash for PRs into `dev` and only
rebase/merge for PRs into `main`. The distinction here is enforced by which
skill (and which `--squash`/`--rebase`/`--merge` flag) is used at merge
time, not by disabling strategies repo-wide. Keep squash, rebase, and merge
commits all enabled in repo settings so both directions have their intended
strategy available.

## General rules

- Don't merge your own PR without review except in emergencies.
- Never merge without being explicitly asked to.
