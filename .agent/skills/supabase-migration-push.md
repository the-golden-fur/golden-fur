# Supabase migration push

**Use when** a task added or changed files under `supabase/migrations/` and
the work is otherwise **complete** — this is the closing step that applies
those migrations to the linked Supabase project via `npm run supabase:push`
(the `📤 Supabase: Push Migrations` VS Code task runs this exact script —
it's a plain `supabase db push`, no `--linked` flag). Run the npm script (or
the VS Code task), never a raw `supabase db push`/`npx supabase db push`
invocation typed by hand — the hand-typed form is what actually gets
blocked by a sandboxed session's permission classifier; the npm script is
the recognized, pre-approved path.

**Run it once, at the very end.** Never mid-task, never after each migration
— a half-finished set of migrations pushed to the shared remote is worse
than none. If more migration work is coming in the same task, wait.

## Preconditions

1. The task's code changes are done and `ci-verifier` is green.
2. `supabase-seed-maintenance` / `seed-sync-agent` has already reconciled
   `supabase/seeds/` with the new schema (a push that lands a table the
   seeds don't fill leaves the next `db reset` short).
3. `supabase/.temp/project-ref` shows the **dev/staging** project, not
   production. Confirm the linked ref out loud before pushing. If it's the
   prod project, stop and ask.
4. `npm run supabase:status` (`📊 Supabase: Check Migration Status`) — the
   new local migrations show as not-yet-applied and nothing remote is
   missing locally.

## Process

1. `git status` — every new `supabase/migrations/*.sql` is committed or at
   least staged (you push what's on disk; know what that is).
2. Run `npm run supabase:push` (the `📤 Supabase: Push Migrations` VS Code
   task) — not a hand-typed `supabase db push` / `npx supabase ...`
   invocation. Review the plan it prints **before** confirming — it lists
   exactly which migration files will run.
3. On success: re-run `npm run supabase:status` and confirm the new
   versions are now `applied` remotely. Report the list of versions pushed.
4. On failure: do **not** retry blindly or run `supabase migration repair`
   to paper over it. Read the error, fix the migration locally, and if the
   remote is now in a partial state say so explicitly and hand back — repair
   is a deliberate, human-confirmed step (`🩹 Supabase: Repair Migration
History`), not an auto-recovery.
5. This skill never touches `db reset --linked` (destructive) or the local
   DB — only `db push` against the already-linked remote.

## What this skill does not do

- No commits, no PR — that's the git skills.
- No local `supabase db reset` / reseed — that's a dev-loop action, not a
  deploy step.
- No production pushes without an explicit, in-the-moment go-ahead naming
  the prod project.
