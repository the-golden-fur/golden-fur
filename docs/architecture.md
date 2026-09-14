# Architecture

## Overview

Golden Fur is a single-repo (monorepo-style) app with three top-level
workspaces:

```
golden-fur/
├── client/     React + Vite frontend (customer portal + staff console)
├── server/     Express + TypeScript API
└── supabase/   Database schema, migrations, seeds, and edge functions
```

`client` and `server` are independent npm workspaces (each with its own
`package.json`), run together in development via the root `npm run dev`
script (`concurrently`). Both talk to the same Supabase project for
authentication, data storage, and file storage.

```
Browser (React SPA)
    │  Supabase JS client — auth session, direct reads guarded by RLS
    ▼
Supabase (Postgres + Auth + Storage)
    ▲
    │  service-role client — privileged operations, business rules
Express API (server/)
```

The client talks to Supabase directly for session management and
RLS-guarded reads, and to the Express API for operations that need
server-side validation, cross-table business rules, or the service-role key
(which never touches the browser).

## Client (`client/`)

- **`src/pages/`** — top-level routed pages not tied to a single feature
  (landing page, home, profile, settings, app shell).
- **`src/features/<name>/`** — one folder per business domain
  (`auth`, `booking`, `customers`, `discounts`, `maintenance`, `staff`).
  Each typically contains:
  - `api/` — Supabase/API calls for that domain
  - `components/`, `pages/` — UI
  - `<name>.routes.tsx`, `<name>.types.ts`
- **`src/shared/`** — cross-feature code: shared API client, auth context,
  reusable components, hooks, providers.
- **`src/routes.tsx`** — top-level route table wiring pages/features
  together.

## Server (`server/`)

Mirrors the client's feature layout so the same business domain is easy to
find on both sides:

- **`src/features/<name>/`** — `*.controller.ts`, `*.routes.ts`,
  `*.types.ts`, plus `modules/` and/or `services/` for domain logic, and
  `tests/` for that feature's test suite.
- **`src/shared/`** — Express app wiring (`app.routes.ts`), auth middleware,
  shared services, centralized error handling, and config.
- **`src/app.ts`** — Express app entry point.

## Database (`supabase/`)

- **`migrations/`** — timestamped, numbered SQL migrations (one change per
  file), applied in order via `npm run supabase:push`. Every table has
  Row-Level Security policies defined alongside its creation migration.
- **`schemas/`** — declarative schema definitions used for local schema
  diffing.
- **`seeds/`** — TypeScript seed scripts, one `mNN-<slug>/` folder per
  Modules-Features module that has reference data (`npm run seed:all` runs
  them all), populating realistic sample data (branches, staff, customers,
  pets, services/packages, promos, discounts, vet catalog) for local
  development and testing.
- **`tests/`** — database-level tests.
- **`functions/`** — Supabase Edge Functions (reserved for future use).

## Domain model at a glance

- Two physical **branches**: Makati and Southwoods. Veterinary services are
  Makati-only; every other service type is offered at both branches.
- **Staff roles**: Superadmin, Admin, Supervisor, Receptionist, Groomer,
  Veterinarian, Cashier, Pet Assistant — each with a role-scoped dashboard
  and permission tier enforced both in the UI and via RLS/API checks.
- **Customers** manage **pets**, which flow through **bookings** for one of
  four service types: Grooming, Pet Hotel, Daycare, and Veterinary
  consultations.

## Module map

The product is specified as 14 modules (M01–M14), each covering one area of
the business. All 14 are implemented; each row cites the feature folder(s)
under `client/src/features/` and `server/src/features/` that back it. (A
few features beyond the original 14 - `messaging`, `rewards` - were added
later and aren't part of this module numbering.)

| Module | Area                                          | Status                        |
| ------ | --------------------------------------------- | ----------------------------- |
| M01    | Staff accounts, login, TOTP, availability     | Implemented (`auth`, `staff`) |
| M02    | Customers & pet profiles                      | Implemented (`customers`)     |
| M03    | Booking (slot/staff picker, reschedule, etc.) | Implemented (`booking`)       |
| M04    | Grooming queue & execution                    | Implemented (`grooming`)      |
| M05    | Pet Hotel (cages, care log)                   | Implemented (`hotel`)         |
| M06    | Daycare check-in/out                          | Implemented (`daycare`)       |
| M07    | Veterinary consultations                      | Implemented (`veterinary`)    |
| M08    | Sales & billing / checkout                    | Implemented (`billing`)       |
| M09    | Policy configuration                          | Implemented (`booking`)       |
| M10    | Customer credits                              | Implemented (`credits`)       |
| M11    | Notifications                                 | Implemented (`notifications`) |
| M12    | Category-level discounts                      | Implemented (`discounts`)     |
| M13    | Services, packages & pricing                  | Implemented (`maintenance`)   |
| M14    | Daily sales reports / analytics               | Implemented (`reports`)       |

## CI

`.github/workflows/ci.yml` runs on every pull request into `main` or `dev`:
client + server test suites, client + server lint, a repo-wide Prettier
format check, and a client production build. See
[setup.md](setup.md#8-run-the-tests) for running the same checks locally.
