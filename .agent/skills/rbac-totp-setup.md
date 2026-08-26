# RBAC & TOTP setup

**Purpose:** reference steps for scaffolding TOTP enrollment and
role-gated middleware/routes, so new protected routes/pages follow the
same pattern instead of being hand-rolled per feature.

**Where this lives:** `server/src/features/auth/staff`,
`server/src/features/auth/customers`, `server/src/features/staff`;
`requireMfa` middleware at
`server/src/features/auth/staff/middleware/requireMfa/`.

**Use whenever** adding a new protected route/page, or touching
login/session/MFA/OAuth code.

## The 8 staff roles

Superadmin, Admin, Supervisor, Receptionist, Groomer, Veterinarian,
Cashier, Pet Assistant — each with a role-scoped dashboard and permission
tier. (Note: this is the current, authoritative role list — 8, not 6;
disregard any older reference to "six roles.")

## Three-layer enforcement

Every protected route/page needs a role check at **all three** of these
layers — a check present in only one or two is incomplete, not just
stylistically inconsistent:

1. **UI route guard** — the client-side route/component gating who sees
   the page at all.
2. **Server/API middleware** — the actual enforcement; the UI guard alone
   is never sufficient since the API is reachable directly.
3. **Row-Level Security policy** — for any table the route reads/writes,
   defined alongside that table's creation migration (see
   `db-schema-agent`/`AGENTS.md`'s coding conventions).

## Role scoping is often narrower than "the obvious role"

Don't assume a task belongs to the role whose name matches it most
closely, and don't infer role ownership from array order in an
`ALLOWED_VIEWER_ROLES` set or similar role-gate list — that order isn't
meaningful, just however the set was originally written. Two concrete
examples of scoping that's easy to get wrong by guessing:

- Money-handling actions like `payment_stage` advancement are restricted
  to Superadmin, Admin, Supervisor, Receptionist, Cashier specifically —
  not every staff role.
- The Hotel Queue (`/staff/hotel/queue`) and Daycare Queue
  (`/staff/daycare/queue`) are scoped to **Groomer and Pet Assistant
  only** — Receptionist has no access to either, despite being a
  plausible-sounding owner for a "queue" page.

When scoping a page/feature to a role, check the actual current
route/middleware code and the sidebar/dashboard config
(`staffDashboard.config.ts`) — and ask if it's unclear whether the current
role list reflects an intentional decision or unaudited leftover access —
rather than assuming from the role or feature name.

## TOTP MFA

Follow the existing `requireMfa` middleware pattern
(`server/src/features/auth/staff/middleware/requireMfa/`) for any new MFA-
gated action rather than inventing a parallel mechanism. Test coverage for
auth changes lives in `server/src/features/auth/**/tests/`
(`*.unit.spec.ts`, `*.middleware.unit.spec.ts`, `*.integration.spec.ts`).

## Session management

Session timeouts are role-tiered and inactivity-based, not a flat
duration — a modal warns the staff member shortly before expiry with a
stay-signed-in option. Match this pattern for any new session-lifecycle
work rather than introducing a fixed timeout.

## Never touch production config

This is security-sensitive code — never write, suggest, or commit real
secrets, service-role keys, or production config while working in this
area.
