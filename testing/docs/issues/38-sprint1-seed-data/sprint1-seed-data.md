# Issue #38: Seed SQL for Sprint 1 Reference Data

Type: Sprint 1 chore, tracked as Issue #38
Branch: `chore/wire-app-routes` (implemented alongside Issue #36 in the same
session, to unblock login-gated manual verification for that issue)

## Overview

Seeds realistic Sprint 1 reference data in two parts, per a hard constraint:
`staff_profiles`/`customer_profiles` have a 1:1 FK to `auth.users`, which a
plain `INSERT` can't populate on a hosted Supabase project.

- `supabase/seed.sql` - branches only (Makati, Southwoods), idempotent via
  `ON CONFLICT (name) DO NOTHING`. Auto-runs on `supabase db reset`.
- `supabase/seeds/seedStaffAndCustomers.ts` - one staff account per
  `staff_role` (8 total, split across both branches) and 3 customer accounts
  (1-2 pets each, varied species/weight_class/coat_type, one with a
  placeholder `facebook_id`), via the Supabase Admin API. Run manually with
  `npm --prefix supabase run seed:staff-customers` - **not** wired into
  `npm run dev`, so a shared dev/staging database is never silently
  reseeded.

### Important: this repo already had a different seed.sql before this issue

`supabase/seed.sql` previously combined branches + 16 staff (2 per role x 2
branches) + 5 customers (no pets, no `facebook_id`) into one file, inserting
directly into `auth.users` via raw SQL - a different, earlier design that
predates this issue and doesn't match its ACs (not branches-only, not
idempotent, no `seedStaffAndCustomers.ts`, no pets, no `facebook_id`). That
version had already been run against the real linked Supabase project
(`gtqncxqsofqtzrlgxdfm`), so 32 staff (`<branch>.<role>1/2@goldenfur.com`)
and 6 customers (`customer1@` .. `customer6@goldenfur.com`) already existed
there. This issue reverted `seed.sql` to branches-only and added the new
script per spec; the old rows were left in place (not deleted) since
removing existing accounts wasn't requested and would be destructive to
other people's local testing.

Because of that pre-existing data, this script's own customer emails are
`customer7@` / `customer8@` / `customer9@goldenfur.com` (not
`customer1-3@`), to avoid colliding with the old rows - a same-numbered
collision would have made the idempotency check skip them and silently
produce zero pets/`facebook_id` data.

All seeded accounts (old and new) use the password `password123`.

## Automated Verification

From `supabase/` (first run `npm install` here if you haven't - it's a
separate package from `client/`/`server/`, matching their pattern):

```powershell
npm.cmd run typecheck
npm.cmd run test
```

Expected: typecheck clean, all tests pass (7 tests covering
`buildStaffSeedPlan`'s 8-role/2-branch split, `buildCustomerSeedPlan`'s
pet/facebook_id shape, a full mocked first-run creating everything, a
mocked re-run proving idempotency with zero duplicate inserts, and a check
that `staff_unavailability_blocks`/`pet_vaccination_records`/
`pet_medical_notes` are never touched).

## Manual Verification

### Part 1 - Run the seed script for real (AC-1 through AC-4)

1. Ensure `server/.env` has real `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` values (Issue #38's own prerequisite - the
   script loads env vars from `server/.env`, not its own).
2. From the repo root: `npm run supabase:seed:staff-customers` (or
   `npm --prefix supabase run seed:staff-customers` directly).
3. Confirm the console output shows `created: staff ...` for all 8 roles
   and `created: customer ...` for `customer7`/`8`/`9`, each with the right
   pet count (2, 1, 2).
4. Run the script a **second** time. Confirm every line now reads
   `skip: ... already seeded` and the summary shows `created: 0` for both
   staff and customers - proving AC-6's idempotency without needing to wipe
   the database first.

### Part 2 - Confirm via SQL Editor (AC-1 through AC-5)

5. In the Supabase Dashboard, go to **SQL Editor** → **New query**.
6. Paste in and run
   `testing/docs/issues/38-sprint1-seed-data/sprint1-seed-data.sql` from
   this repo, one numbered section at a time (or all at once - each
   `select` returns its own result set).
7. Confirm each section's result matches the `-- Expected:` comment above
   it, in particular section 5 - all three excluded tables return `0`.

### Part 3 - Confirm accounts actually work (ties back into Issue #36)

8. With both `server/` and `client/` dev servers running, go to
   `/staff/login` and sign in as one of this script's new accounts, e.g.
   `makati.superadmin@goldenfur.com` / `password123`. Confirm it succeeds
   and lands on `/staff`.
9. Go to `/login` and sign in as `customer9@goldenfur.com` /
   `password123` (the `facebook_id` account). Confirm it succeeds, then
   navigate to `/portal/profile` and confirm its 2 pets (Luna, Rocky) are
   visible - this is also your Part 2/AC-2 manual check for Issue #36's
   customer/pet guarded routes.
10. Optionally, log in as one of the **old** pre-existing accounts (e.g.
    `makati.veterinarian1@goldenfur.com` / `password123`) to confirm the
    two seed generations coexist without conflict.
