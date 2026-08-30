# PR: dev → main

**Use whenever** opening a release/promotion PR that merges `dev` into
`main`. For a feature/fix branch into `dev`, use the separate `pr-to-dev`
skill instead — the two directions use different merge strategies.

## Process

1. Make sure `dev` is up to date and includes everything intended for this
   release/promotion.
2. **Confirm each feature/fix branch merged into `dev` since the last
   promotion was reviewed** by the `code-reviewer` subagent
   (`.agent/agents/code-reviewer.md`) at `pre-pr` time — its reports live
   under `../golden-fur-vault/Projects/golden-fur/testing/reviews/`. If any
   branch has no review on record, run the `code-reviewer` on that PR's
   diff now (trigger `pre-pr`) and resolve any **Blocking** findings before
   promoting. A `dev` → `main` promotion adds no new code, so it needs no
   fresh full-tree review of its own.
3. Title/body summarize what's shipping — this can aggregate several
   feature/fix PRs merged into `dev` since the last promotion, not just one
   change. Sections: Summary, What Changed (notable features/fixes since
   the last dev → main promotion), Testing.
4. Open it directly: `gh pr create --base main --head dev --title "..."
--body "..."`.

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
