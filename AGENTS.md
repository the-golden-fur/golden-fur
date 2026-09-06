# golden-fur — Agent Instructions

## Project summary

Golden Fur is a capstone management information system (MIS) for a
two-branch pet care business (Makati and Southwoods) offering grooming, pet
hotel, daycare, and veterinary services. It has two applications sharing one
Supabase backend: a customer-facing booking portal, and a role-scoped staff
console (Superadmin, Admin, Supervisor, Receptionist, Groomer, Veterinarian,
Cashier, Pet Assistant) for running bookings, service execution, billing,
promos/discounts, and customer/pet records. See
[docs/architecture.md](docs/architecture.md) for the full module breakdown.

## Tech stack

| Layer         | Technology                                                  |
| ------------- | ----------------------------------------------------------- |
| Frontend      | React 19, TypeScript, Vite, React Router, Zod               |
| Backend       | Node.js, Express, TypeScript, Zod                           |
| Database/Auth | Supabase (PostgreSQL 17, Auth, Storage, Row-Level Security) |
| Testing       | Vitest, Testing Library, Supertest                          |
| Tooling       | ESLint, Prettier, GitHub Actions CI                         |

`client/` and `server/` are independent npm workspaces, run together via
`npm run dev` from the repo root. `supabase/` holds migrations, declarative
schemas, seeds, and edge functions.

## Where things live

- **`docs/`** is dev-facing documentation only — setup guides, architecture,
  anything a new developer needs to build/run/ship the project.
- **Working notes, meeting notes, and every session's record belong in the
  sibling `../golden-fur-vault` repo**, not here. Each request thread that
  changes this app gets a `Projects/golden-fur/sessions/NN-<slug>/` there — a
  near-beginner plan, a click-by-click test script, copied context (written
  by the vault's `session-documenter` agent at implementation-finish), and
  the PR-time `code-review` summary. Project-wide context / decisions /
  design live under `Projects/golden-fur/shared/`; business-process workflow
  docs under
  `Library/golden-fur/features/<feature>/` (human) and
  `Reference/golden-fur/features/<feature>/` (machine).
- **`temp/`** is scratch space (context files, design assets) used while
  working a request; it's gitignored.
- **Reusable skills (multi-tool)** — this repo's own git workflow
  (`branch-naming`, `commit`, `pr-to-dev`, `pr-dev-to-main`, `fill-issue`)
  plus a local dev-server pre-flight check (`dev-servers`) lives here in
  `.agent/skills/`, with thin per-tool adapters in `.claude/skills/`,
  `.gemini/commands/`,
  `.codex/prompts/`. The vault's own
  skills/agents (`note-filing`, `vault-librarian`, `session-documenter`) stay
  in `../golden-fur-vault` since they operate on vault content — see
  [golden-fur-vault/AGENTS.md](../golden-fur-vault/AGENTS.md). Details on
  this repo's own skills, and why `pr-to-dev`/`pr-dev-to-main` are split, are
  in the "Reusable skills" section below.
- **Dev-time domain agents/skills** — subagents and reference material for
  this project's own business logic (booking capacity, payments, RBAC,
  schema) live in `.agent/agents/` and `.agent/skills/`, with the same
  thin-adapter pattern per tool. See
  "Domain agents & skills" below. These are developer tooling only — they
  run locally while writing code and are never deployed or reachable by
  end users; their output is ordinary source code you review and commit.

## Coding conventions

- Feature-based folders on both sides: `client/src/features/<name>/` and
  `server/src/features/<name>/`, one per business domain (`auth`, `booking`,
  `customers`, `discounts`, `maintenance`, `staff`, ...). Cross-feature code
  goes in `src/shared/`.
- Server features mirror the client's naming: `*.controller.ts`,
  `*.routes.ts`, `*.types.ts`, plus `modules/`/`services/` for domain logic
  and a `tests/` folder per feature. A new `*.routes.ts` file also needs
  its bare path prefix added to `API_ROUTE_PREFIXES` in
  `client/vite.proxy.config.ts` so the dev proxy forwards it to Express —
  `vite.proxy.config.spec.ts` fails CI if you forget.
- Request/response validation uses Zod on both client and server.
- The client talks to Supabase directly for auth/session and RLS-guarded
  reads; it goes through the Express API for anything needing server-side
  validation, cross-table business rules, or the service-role key.
- Every table's Row-Level Security policy is defined alongside its creation
  migration in `supabase/migrations/`.
- Formatting: Prettier (single quotes, semicolons, 2-space indent, 80-col
  print width — see `.prettierrc`). Linting: ESLint (`client/` and `server/`
  each have their own config). CI (`.github/workflows/ci.yml`) runs both
  test suites, both lints, a repo-wide Prettier check, and a client build on
  every PR into `main`/`dev`.

## Reusable skills (multi-tool)

**`commit`, the `pr-*` skills, and branch creation are explicit-request
only** — run them when the user asks, never as an automatic end-of-task
step. Finishing work means leaving it staged/unstaged and saying it's
ready; the user calls the commit.

`.agent/skills/` holds the canonical, tool-agnostic instructions for this
repo's git workflow: `branch-naming` (name and create a branch),
`commit` (write and create a conventional commit — performs the commit
itself, not just a drafted message), `pr-to-dev` (open a PR into `dev`,
squash merge only), `pr-dev-to-main` (open a `dev` → `main` release PR,
rebase preferred/merge fallback, never squash), and `fill-issue` (turn a
plain-text description into a filled, opened GitHub issue) — plus
`dev-servers` (how to safely start/stop/troubleshoot the local
`client`/`server` dev processes without starting a colliding second copy
of one already running — deliberately not named `run`, so it doesn't
shadow Claude Code's own built-in `run` skill, which drives the app in a
browser; use `dev-servers` first to confirm the processes are up, then
`run` to actually look at a page; `npm run dev`'s `predev` frees the port
first via `scripts/free-ports.mjs`, and `npm run free-ports` does it on
demand), `pre-commit-checks` (run every
`(check)`/`(fix)`-labeled VS Code task — lint and format, client and
server — auto-fixing what it can; **standalone-on-request only** now — no
longer a pipeline step, `ci-fixer-agent` owns lint/format at PR time), and
`gitkeep-empty-dir` (add a `.gitkeep` to one specific directory that's
**deliberately, permanently** meant to ship empty — explicit-request only,
never for a directory that's simply not filled in yet mid-task; there is no
longer an automatic counterpart — the `gitkeep-cleanup` `Stop` hook was
removed 2026-09-06). Any AI coding tool working in this repo should read the
relevant file under `.agent/` before doing that kind of task.

**`pr-to-dev` and `pr-dev-to-main` are the "session is finished" finish
pipeline**, run in a locked order (see the skill files and "Auto-run
wiring" below): `branch-naming` (if on `dev`) → `ci-verifier` once (both
repos) → `ci-fixer-agent` if red, re-verify → the `code-review` skill
in-session (resolve Blocking, drop a summary in the session's `reviews/`)
→ confirm the session record already exists (`session-documenter` ran at
implementation-finish) → `commit` → push → `gh pr create` → then the vault
PR. **`commit` on its own runs no gate at all** — not `pre-commit-checks`,
not `ci-verifier`, not the review. Everything gated happens only when a PR
is actually being opened. (Line endings are handled by `.gitattributes` —
`* text=auto eol=lf`.) The `pr-guard` hook (checked in — see "Auto-run
wiring") blocks a direct `gh pr create` until `ci-verifier` has left
`.git/ci-verifier-pass` for `HEAD` and a review file exists in the branch's
`../golden-fur-vault/Projects/golden-fur/sessions/<NN-slug>/reviews/` — see
the vault decision record
`Projects/golden-fur/shared/decisions/2026-08-30-unbiased-code-reviewer-subagent.md`
(the bespoke `code-reviewer` subagent was retired 2026-09-06 in favour of
the built-in `code-review` skill, run in-session — same gate, one fewer
cold subagent per PR).

Tool-specific directories are thin adapters over that same content, wired
up per tool's own discovery mechanism:

- **Claude Code** — `.claude/skills/<name>/SKILL.md` (auto-invoked skill),
  each just pointing at the matching `.agent/` file.
- **Gemini CLI** — `.gemini/commands/<name>.toml` (manually invoked as
  `/<name>`).
- **Codex CLI** — `.codex/prompts/<name>.md` (manually invoked as
  `/<name>`; verify your Codex version picks up project-scoped prompts).
- **Other tools** without a documented per-repo skill/command convention —
  they should still pick this up by reading `.agent/` directly, or via
  this file if they support an `AGENTS.md`-style root context file.

When updating one of these workflows, edit the canonical file under
`.agent/` — the adapters shouldn't need to change unless the tool's own
discovery metadata (name/description) changes.

## Domain agents & skills

Dev-time subagents and reference material for this project's own business
logic — scaffolding, reviewing, and debugging domain code before it's
committed, and a written spec Claude Code loads instead of re-deriving a
business rule from scratch each session. Canonical files live in
`.agent/agents/` and `.agent/skills/`; the same thin-adapter pattern as the
git-workflow skills above applies (`.claude/agents/<name>.md` +
`.claude/skills/<name>/SKILL.md`, `.gemini/commands/<name>.toml`,
`.codex/prompts/<name>.md`).

**Agents** (spawnable subagents, most with full dev tool access unless
noted):

- `ci-verifier` — **read-only** runner for the `✅ CI: Verify All` task
  (tests, lint, format, build) across **both** `golden-fur` and
  `golden-fur-vault`. Runs automatically **only when a PR is being opened**
  (`pr-to-dev` / `pr-dev-to-main`) — not at commit or branch-publish time;
  reports one pass/fail with the failing output, never fixes or commits.
  Keeps the full suite/build output out of the main session. Still fine to
  run by hand any time.
- **Code review at PR time** uses the built-in `code-review` skill
  (`Skill(code-review, "high")`), run **in-session** as step 4 of
  `pr-to-dev` / `pr-dev-to-main` — not a spawned subagent. Resolve every
  **Blocking** finding, then write a short summary (verdict + blocking count
  - notes actioned) to
    `../golden-fur-vault/Projects/golden-fur/sessions/<NN-slug>/reviews/<YYYY-MM-DD-HHmm>-pre-pr.md`
    — `pr-guard` requires a file there. Skip the gate only for a pure
    formatting/non-functional diff, and say so. (The old bespoke
    `code-reviewer` subagent was retired 2026-09-06 — the built-in gives the
    same gate without a cold subagent boot per PR; the rationale in
    `Projects/golden-fur/shared/decisions/2026-08-30-unbiased-code-reviewer-subagent.md`
    still stands for why review happens at PR time at all.)
- `booking-capacity-agent` — cage/session/groomer/staff capacity and
  overbooking-prevention logic (Grooming/Hotel/Daycare/Veterinary).
- `payment-billing-agent` — PayMongo webhook handling and the Credit
  Balance ledger, sandbox only.
- `auth-access-agent` — RBAC, TOTP MFA, OAuth account-merge. Read-mostly
  (`Read`, `Grep`, `Glob`, `Edit` — no `Write`/`Bash`) so it can't touch
  production config.
- `db-schema-agent` — Supabase migrations and multi-branch data isolation.

(Dormant-module agents — `report-generator-agent`, `notification-agent`,
`discount-compliance-agent`, `qa-iso25010-agent`, plus their backing
reference skills — were removed 2026-09-06 while those modules aren't in
active build. Recreate from git history when one goes live.)

**Maintenance agents** (keep generated/derived artifacts in step with the
code as a task closes — see "Auto-run wiring" below):

- `seed-sync-agent` — updates `supabase/seeds/` (the idempotent `.ts` +
  mirrored `.sql` + `.spec.ts` trio) when a migration touches a seeded
  table or adds a reference/lookup table. Backed by the
  `supabase-seed-maintenance` skill, which carries the coverage map
  (what's seeded, what's migration-seeded, what's deliberately app-only).
- `ci-fixer-agent` — the write-side counterpart to `ci-verifier`: takes a
  red `✅ CI: Verify All` and fixes the failures (format, lint, build,
  tests) until green, across both repos, without ever weakening a check.
  **Auto-invoked** as step 3 of the `pr-to-dev` / `pr-dev-to-main` pipeline
  the moment `ci-verifier` reports red; also absorbs what `pre-commit-checks`
  used to do at PR time (the lint + format auto-fix pass).
  **Skills** (auto-invoked reference material — each backs the matching
  agent above, and applies equally when working the same area without
  spawning a subagent):

- `paymongo-webhook-handling`, `capacity-based-scheduling`,
  `rbac-totp-setup`, `credit-balance-ledger`, `supabase-seed-maintenance`.
- `supabase-migration-push` — the closing step of a task that changed
  `supabase/migrations/`: `npm run supabase:push` (the
  `📤 Supabase: Push Migrations` VS Code task — not a hand-typed
  `supabase db push`/`npx supabase ...`) to the linked project, run
  **once, only after the whole task is done** and `ci-verifier` is green
  and the seeds are reconciled. Confirms the linked ref isn't production
  first.
- `workflow-doc-sync` — **explicit-request only** (no longer a PR step — it
  spawned the vault `workflow-documenter`, sometimes twice, every PR for a
  check that rarely found drift). Run it by hand over the whole branch diff
  when you want the check: it matches changed paths against each vault
  machine-workflow file's `source:` frontmatter
  (`../golden-fur-vault/Reference/golden-fur/features/**/workflows/*.md`),
  then hands off to the vault's `workflow-documenter` agent (the only thing
  allowed to rewrite them). Never writes to the vault.

### Auto-run wiring

`.claude/settings.json` (checked in) wires two Claude Code hooks. Hooks are
Claude-specific — other AI tools replicate the intent via their own
mechanisms. (Three `Stop` hooks — `maintenance-reminders.sh`,
`gitkeep-cleanup.sh` here and `gitkeep-sweep.sh` in the vault — were removed
2026-09-06: they ran shell work on every turn end and, in the case of
`maintenance-reminders`, nudged the session into spawning agents mid-task.
Their intent now lives in the skill descriptions and the two surviving
hooks.)

**`session-router`** (`UserPromptSubmit`) — deterministically routes the
session by matching the prompt text; injects guidance, never blocks:

- "just plan" / "don't touch code" / "no code yet" / `/plan` → the vault's
  `plan` skill; edit no code; write only `sessions/<NN-slug>/plan.md`.
- "open a PR" / "ship it" / "pr this" / `/pr` → the locked finish pipeline
  (`branch-naming` → `ci-verifier` once → `ci-fixer-agent` if red → the
  `code-review` skill in-session → confirm the session record exists →
  `commit` → push → `gh pr create` → vault PR).

**`pr-guard`** (`PreToolUse` on `Bash`) — blocks `gh pr create` until
`ci-verifier` has left `.git/ci-verifier-pass` for the current `HEAD` **and**
a review file exists in the branch's `sessions/<NN-slug>/reviews/`. This is
the enforcement half of "review + verify only happen at PR time, but must
happen".

**PR-time only** (steps of `pr-to-dev` / `pr-dev-to-main`, never of `commit`
or a branch push): `ci-verifier`, `ci-fixer-agent`, and the in-session
`code-review` pass. `workflow-doc-sync` is no longer among them —
explicit-request only. The `session-documenter` agent (in the vault) runs at
implementation-finish, then just updates the same `sessions/NN-<slug>/` on
later requests in the session; the PR flow only _checks_ the folder exists,
it doesn't spawn the agent.

### Why two PR skills instead of one

`pr-to-dev` and `pr-dev-to-main` intentionally use different merge
strategies (squash vs. rebase/merge). GitHub's squash/rebase/merge toggles
in Settings → General are repo-wide, not per base branch, so the two
directions can't be enforced by disabling strategies for one and not the
other — enforcement is by which skill (and which `gh pr merge` flag) is
actually used. Keep all three merge strategies enabled in repo settings.
