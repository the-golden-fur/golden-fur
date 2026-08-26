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
- **Working notes, test logs, meeting notes, and per-issue/per-request
  verification docs belong in the sibling `../golden-fur-vault` repo**, under
  `Projects/golden-fur/`, not in this repo.
- **`temp/`** is scratch space (context files, design assets) used while
  working a request; it's gitignored.
- **Reusable skills (multi-tool)** — this repo's own git workflow
  (`branch-naming`, `commit`, `pr-to-dev`, `pr-dev-to-main`, `fill-issue`)
  plus a local dev-server pre-flight check (`dev-servers`) lives here in
  `.agent/skills/`, with thin per-tool adapters in `.claude/skills/`,
  `.gemini/commands/`,
  `.codex/prompts/`. The vault's own
  skills/agents (`note-filing`, `vault-librarian`, `weekly-reviewer`) stay in
  `../golden-fur-vault` since they operate on vault content — see
  [golden-fur-vault/AGENTS.md](../golden-fur-vault/AGENTS.md). Details on
  this repo's own skills, and why `pr-to-dev`/`pr-dev-to-main` are split, are
  in the "Reusable skills" section below.
- **Dev-time domain agents/skills** — subagents and reference material for
  this project's own business logic (booking capacity, payments, RBAC,
  reports, notifications, discounts, QA, schema) live in `.agent/agents/`
  and `.agent/skills/`, with the same thin-adapter pattern per tool. See
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
  and a `tests/` folder per feature.
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
`run` to actually look at a page). Any AI coding tool working in this
repo should read the relevant file under `.agent/` before doing that kind
of task.

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

- `booking-capacity-agent` — cage/session/groomer/staff capacity and
  overbooking-prevention logic (Grooming/Hotel/Daycare/Veterinary).
- `payment-billing-agent` — PayMongo webhook handling and the Credit
  Balance ledger, sandbox only.
- `auth-access-agent` — RBAC, TOTP MFA, OAuth account-merge. Read-mostly
  (`Read`, `Grep`, `Glob`, `Edit` — no `Write`/`Bash`) so it can't touch
  production config.
- `report-generator-agent` — Daily Sales Report and related
  report-generation code.
- `notification-agent` — the transactional notification triggers/templates.
- `discount-compliance-agent` — the (currently inactive) Discount Module,
  including Senior/PWD statutory handling.
- `qa-iso25010-agent` — test cases plus the ISO/IEC 25010 evaluation
  questionnaire (the latter is a vault deliverable, not code).
- `db-schema-agent` — Supabase migrations and multi-branch data isolation.

**Skills** (auto-invoked reference material — each backs the matching
agent above, and applies equally when working the same area without
spawning a subagent):

- `paymongo-webhook-handling`, `capacity-based-scheduling`,
  `rbac-totp-setup`, `credit-balance-ledger`, `daily-sales-report-format`,
  `email-notification-templates`, `discount-senior-pwd-compliance`,
  `iso25010-evaluation-instrument`.

### Why two PR skills instead of one

`pr-to-dev` and `pr-dev-to-main` intentionally use different merge
strategies (squash vs. rebase/merge). GitHub's squash/rebase/merge toggles
in Settings → General are repo-wide, not per base branch, so the two
directions can't be enforced by disabling strategies for one and not the
other — enforcement is by which skill (and which `gh pr merge` flag) is
actually used. Keep all three merge strategies enabled in repo settings.
