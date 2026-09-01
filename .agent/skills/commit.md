# Commit

**Explicit request only.** Run this skill **only when the user directly
asks for a commit** — "commit this", "make a commit for X", `/commit`.
Never invoke it on your own: not as a task wrap-up step, not because a
chunk of work looks done, not right after tests pass, not because the
working tree is dirty. Finishing a task means leaving the changes staged-
or-unstaged and _telling the user they're ready to commit_ — the user
decides when.

This skill performs the actual commit; it does not just print a message
for the user to paste.

## Process

1. **Run `.agent/skills/pre-commit-checks.md` first** — lint and format,
   fix then check, for both `client` and `server`. Resolve or surface
   anything it flags before moving on; don't skip straight to staging.
2. Look at `git status --short` and `git diff` (staged and unstaged) to see
   what changed, and `git log --oneline -10` to match this repo's style.
3. Stage the relevant files. Review what a broad `git add` would pick up
   (`git status` after) rather than blindly using `git add -A`. If anything
   staged looks unrelated to the request or might contain a secret, flag it
   before committing.
4. Write the commit message following the format below.
5. Create the commit directly (pass multi-line messages via a heredoc so
   formatting survives), then run `git status` to confirm it succeeded.

> **CI parity (`ci-verifier`) and the unbiased `code-reviewer` no longer
> run at commit or branch-publish time** — both are gates of `pr-to-dev` /
> `pr-dev-to-main` only, run when a PR is actually being opened. Committing
> and pushing a branch just needs `pre-commit-checks` (lint + format) to be
> clean.

## Message format

- Subject: `<type>(<scope>): <subject>` — imperative mood ("add" not
  "added"), max 50 characters, no trailing period. Scope is optional but
  recommended.
- Types: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `perf`, `ci`,
  `style`, `revert`.
- Body — skip for trivial/self-explanatory changes. Add one when the reason
  isn't obvious from the subject, a bug fix needs to describe the wrong
  behavior, or a refactor needs to explain why. WHAT + WHY only (HOW is
  already in the diff); one blank line after the subject; wrap at 72 chars;
  prose, not bullets.
- Footer — one blank line after the body: issue refs (`Closes #42`,
  `Fixes #18`, `Refs #7`); breaking changes get `!` after type/scope
  (`feat(api)!: ...`) plus a `BREAKING CHANGE: <what broke, what to do>`
  footer.
