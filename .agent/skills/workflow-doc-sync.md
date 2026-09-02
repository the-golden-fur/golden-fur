# Workflow doc sync

**Use when a PR is being opened** (`pr-to-dev` / `pr-dev-to-main`) and the
branch changed `client/src` / `server/src` / `supabase/migrations` code
that a documented business-process workflow describes — to find which vault
workflow docs are now stale and get them refreshed. It runs **once per PR,
over the whole branch diff**, not after every task or commit (spawning the
vault `workflow-documenter` agent repeatedly mid-work burns session
budget). Fine to run by hand any time you want the drift check.

The workflow docs live in the **sibling `../golden-fur-vault` repo**
(`Library/golden-fur/features/<feature>/workflows/` + `Reference/golden-fur/features/<feature>/workflows/`),
as a matched human (Mermaid) + machine (YAML step graph) pair per workflow,
grouped by module M01–M14. Each machine file's frontmatter has a `source:`
list of the exact code files it was built from.

**Hard rule:** tools working in `golden-fur` never write to
`golden-fur-vault` and vice versa. This skill only _detects_ drift and
_delegates_; the actual doc edit is done by the vault's own
`workflow-documenter` agent.

## Process

1. **Collect the changed code paths** in this task (`git diff --name-only`
   against the base branch, plus staged).
2. **Scan the vault's machine workflow files.** For each
   `../golden-fur-vault/Reference/golden-fur/features/**/workflows/*.md`, read the
   `source:` frontmatter list. Any overlap with a changed path → that
   workflow (both its files, same `<Code>-<slug>` basename) is a refresh
   candidate.
3. **Sanity-check the hit.** Open the changed file(s) — did the change
   actually touch a branch condition, guard, status transition, validation,
   default, or trigger the workflow depicts? A pure rename / comment / test
   change is not drift. List only genuine candidates.
4. **Hand off.** For each candidate, spawn (or tell the user to run) the
   vault's `workflow-documenter` agent — `../golden-fur-vault/.agent/
agents/workflow-documenter.md`, which is the _only_ thing allowed to
   rewrite those docs — naming the workflow id and the code change so it
   re-verifies every step, not just the changed one. It keeps the existing
   filenames so links don't break.
5. **If no machine file lists a `source:` that overlaps** but the change
   clearly introduces a _new_ user-facing workflow (a new end-to-end flow,
   not a tweak), say so — that's a "document a new workflow" job for
   `workflow-documenter`, not a refresh.
6. **Report** the candidate list (workflow id → which changed file → what
   drifted) even when you can't run the vault agent yourself, so the user
   can.

## Not this skill's job

- Editing any file under `golden-fur-vault`.
- The module notes (`Library/golden-fur/modules/`) — `workflow-documenter`
  handles the cross-link back to those.
