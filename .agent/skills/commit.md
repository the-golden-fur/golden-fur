# Commit

**Use whenever** asked to commit changes — "commit this", "make a commit for
X". This skill performs the actual commit; it does not just print a message
for the user to paste. Only commit when explicitly asked, never as a side
effect of another task.

## Process

1. **Run `.agent/skills/pre-commit-checks.md` first** — lint and format,
   fix then check, for both `client` and `server`. Resolve or surface
   anything it flags before moving on; don't skip straight to staging.
2. **Run an unbiased code review** — spawn the `code-reviewer` subagent
   (`.agent/agents/code-reviewer.md`, trigger `pre-commit`) on the current
   diff. It is read-only and writes its report to
   `../golden-fur-vault/Projects/golden-fur/testing/reviews/<branch>/`.
   Fix every **Blocking** finding before continuing; decide per-nit on the
   Non-blocking ones. Skip this step only for a pure formatting / comment /
   non-functional diff — and say so if you skip. If the code-reviewer
   already ran this session and nothing has changed under `client/src`,
   `server/src`, or `supabase/` since, that pass still counts.
3. Look at `git status --short` and `git diff` (staged and unstaged) to see
   what changed, and `git log --oneline -10` to match this repo's style.
4. Stage the relevant files. Review what a broad `git add` would pick up
   (`git status` after) rather than blindly using `git add -A`. If anything
   staged looks unrelated to the request or might contain a secret, flag it
   before committing.
5. Write the commit message following the format below.
6. Create the commit directly (pass multi-line messages via a heredoc so
   formatting survives), then run `git status` to confirm it succeeded.

## Publishing the branch

The same review gate applies before a branch carrying real commits is
pushed for the first time (trigger `pre-publish`). If every commit on the
branch was already reviewed at `pre-commit` time and nothing has changed
since, no extra pass is needed — otherwise run the `code-reviewer` subagent
on the full `<base>...HEAD` diff before `git push`.

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
