# PR: dev → main

**Use whenever** opening a release/promotion PR that merges `dev` into
`main`. For a feature/fix branch into `dev`, use the separate `pr-to-dev`
skill instead — the two directions use different merge strategies.

## Process — runs once, then done

This skill only opens the **draft** release PR with every field set. It
runs **no CI, test, build, or code-review check** — the user verifies the
release manually after the PR exists. Do not spawn any verifier/fixer
subagent, and do not loop.

1. Make sure `dev` is up to date and includes everything intended for this
   release/promotion (`git fetch` + confirm `origin/dev`).
2. Title/body summarize what's shipping — this can aggregate several
   feature/fix PRs merged into `dev` since the last promotion, not just one
   change. Sections: Summary, What Changed (notable features/fixes since
   the last dev → main promotion), Testing.
3. Open it as a draft with every field set — title, body, assignee,
   label(s) — never left for the user:
   `gh pr create --draft --base main --head dev --title "release: ..." --body-file <file> --assignee @me --label <label>`.
   If a `dev → main` PR is already open (this repo auto-opens one), apply
   the same fields with
   `gh pr edit <n> --title ... --body-file <file> --add-assignee @me --add-label <label>`,
   run `gh pr ready <n> --undo` to set it back to draft, and confirm with
   `gh pr view <n> --json title,assignees,labels,isDraft`. Label is usually
   `feature` (or whichever type dominates the promotion); set a milestone
   with `gh pr edit <n> --milestone "<name>"` when one matches.

Then hand back the PR link. You're done.

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
