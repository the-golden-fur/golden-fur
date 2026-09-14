# PR to dev

**Use whenever** opening a PR that merges a feature/fix/etc. branch into
`dev`. For a `dev` → `main` release PR, use the separate `pr-dev-to-main`
skill instead — the two directions use different merge strategies.

## Process — runs once, then done

This skill does one thing: get the branch pushed and open a **draft** PR
with every field filled in. It runs **no CI, lint, format, test, build,
code-review, or workflow-doc check** — the user runs those manually after
the PR exists. Do not spawn any verifier/fixer subagent, and do not loop.

1. **Branch.** If `HEAD` is `dev` (or `main`), run
   `.agent/skills/branch-naming.md` to create and push the feature/fix
   branch first.
2. **Commit** any outstanding work — run `.agent/skills/commit.md` for
   `golden-fur`. Skip if the tree is already clean.
3. **Push** the branch (`git push -u origin <branch>`).
4. **Open the PR as a draft, with every field set — never leave the title,
   body, assignee, labels, or milestone for the user to fill in.** Write the
   body from `.github/PULL_REQUEST_TEMPLATE.md`'s sections (Summary, What
   Changed, Screenshots/Demo, What, Why, How, Testing, Pre-Merge Checklist)
   to a file, pick the label(s) from the **Labels** rule below, then:
   `gh pr create --draft --base dev --head <branch> --title "<type>(<scope>): <subject>" --body-file <file> --assignee @me --label <label>[,<label>]`
   - **A PR for this branch usually already exists** — this repo auto-opens
     an empty one on first push, so `gh pr create` will error with the
     number. Apply the same fields to that PR instead, and mark it draft:
     `gh pr edit <n> --title "..." --body-file <file> --add-assignee @me --add-label <label>`
     then `gh pr ready <n> --undo` to set it back to draft, and confirm with
     `gh pr view <n> --json title,assignees,labels,isDraft`.
   - Assignee is `@me` unless the user explicitly named someone else.
   - Create a missing label first with `gh label create`.
5. **Milestone + linked issues** — set on the same PR. Milestone:
   `gh pr edit <n> --milestone "<name>"` (format in the **Milestone** rule);
   only skip it when the repo genuinely has no matching milestone, and say
   so when you hand back the PR link. Linked issues: a `Closes #<n>` line
   per issue in the body.
6. **Vault side** — if this session produced `golden-fur-vault` changes
   (`sessions/NN-<slug>/`), commit + push them and open the vault PR with
   the `pr` skill there.

Then hand back the PR link(s). You're done — the user takes it from there.

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
