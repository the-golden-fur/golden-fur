# Keep an empty directory in git

**Use whenever** a specific directory needs to ship as empty **on
purpose** — the user explicitly asks for it ("keep this folder in git even
though it's empty", "add a placeholder so `<dir>` isn't dropped", "gitkeep
this directory"), or an empty directory is unmistakably part of a design
that's already finished (e.g. a documented runtime output/upload directory
the app expects to exist on a fresh clone).

**Never use this for a directory that's simply not filled in yet.** A
folder created mid-task and still empty because the work populating it
isn't done — a new feature folder, a new migration/seed directory, scratch
space for an in-progress change — must stay empty with no `.gitkeep`,
exactly as `git status` already shows it (untracked, invisible to git).
Adding a placeholder there just because it happens to be empty at some
point mid-task papers over unfinished work; wait until either real content
lands in it, or a human confirms the directory is deliberately meant to
stay empty.

If it's ambiguous which of those two cases applies, ask rather than guess.

## Process

1. Confirm the target directory and that its emptiness is deliberate/final,
   not a work-in-progress state — restate your understanding back if the
   request is at all unclear.
2. Confirm git doesn't already ignore it (a `.gitignore`d directory can't be
   kept via `.gitkeep` — nothing under it will ever be tracked):
   ```
   git check-ignore -q <dir> && echo "ignored - .gitkeep won't help" || echo "not ignored"
   ```
3. If the directory already holds other tracked/addable files, stop — it
   doesn't need a placeholder and shouldn't get one.
4. Otherwise, create the placeholder and stage it:
   ```
   : > <dir>/.gitkeep
   git add <dir>/.gitkeep
   ```
5. Leave it staged for the user's own `commit`/`pr-*` step, same as any
   other change — this skill never commits on its own.

## Why this is explicit-request only, not automatic

A blind "sweep every empty tracked-scope directory and gitkeep it" hook
(the old `gitkeep-sweep.sh`) can't tell "this folder is meant to be empty"
apart from "this folder is empty right now because an AI hasn't finished
filling it in yet" — it would gitkeep both identically on every `Stop`,
quietly turning genuinely-unfinished scaffolding into an intentional-looking
empty-folder commit. Only a human (or an AI acting on a clear, explicit
instruction) can tell those two states apart, so adding a `.gitkeep` is
gated on exactly that.

The **removal** side is not gated the same way — a `.gitkeep` sitting next
to real tracked files is always redundant regardless of intent, so cleaning
those up automatically stays safe. That half still runs on every `Stop` via
`.claude/hooks/gitkeep-cleanup.sh` (see AGENTS.md "Auto-run wiring").
