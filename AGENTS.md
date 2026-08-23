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
  `Projects/golden-fur/`, not in this repo. This repo doesn't write there
  itself — see `../golden-fur-vault/prompts/workflow/document-changes.md`
  (run from the vault repo) for the prompt that reads this repo's staged
  changes and documents them into the vault.
- **`prompts/`** holds this repo's own dev-workflow prompt templates:
  `github/` (branch/commit-message/PR/issue templates) and
  `workflow/commit-pr.md` (generate commit messages + PR details for
  currently staged files).
- **`temp/`** is scratch space (context files, design assets) used while
  working a request; it's gitignored.
- **Reusable skills/agents** (`note-filing`, `vault-librarian`,
  `weekly-reviewer`, usable by Claude Code, Gemini CLI, Codex CLI, etc.) live
  in `../golden-fur-vault` (`.agent/`, `.claude/`, `.gemini/`, `.codex/`),
  not here — they operate on vault content, so that's where they're
  discovered. See [golden-fur-vault/AGENTS.md](../golden-fur-vault/AGENTS.md).

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
