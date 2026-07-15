-- M13 Maintenance + M12 Discounts - Sprint 2 Epic A branch-dependent seed
-- data (Issue #44).
--
-- Pure-SQL alternative to module-3-maintenance.seed.ts, for when you'd
-- rather paste this into the Supabase SQL Editor / run it via psql than a
-- Node script. Self-contained - unlike an earlier draft of this file, it
-- does not call into any function defined by a migration; every insert
-- below is plain SQL, matching the module-1/module-2 convention.
--
-- Seeds the three things that need real branches.id values to exist
-- (migration 20260715034 seeds the branch-independent base service catalog
-- + pricing tiers; this file assumes those rows are already present):
--
--   1. service_branch_availability - every base service available at every
--      branch (#40's disable-a-branch-not-opt-in recommendation).
--   2. packages / package_services - the Golden Package (Shampoo/Bath,
--      Blow-dry, Brushing), one row per branch per Modules-Features/MA22 -
--      bundled_price 600 is deliberately below the 700 sum of the included
--      services, since a package price is independent (#41 AC-2).
--   3. discounts - Senior Citizen + PWD, one row per branch per category
--      (2 types x 2 branches x 4 categories = 16 rows), inactive by
--      default. See this folder's .md doc for why 16 rows instead of the
--      Guide's ambiguous "one row per branch".
--
-- Runs automatically on `supabase db reset` (see supabase/config.toml
-- [db.seed] sql_paths, ordered AFTER module-1's seed so branches.id values
-- exist). Idempotent - guarded by ON CONFLICT / NOT EXISTS throughout, safe
-- to re-run against a database that already has these rows.

-- ============================================================
-- 1. service_branch_availability
-- ============================================================

insert into public.service_branch_availability (service_id, branch_id, is_available)
select s.id, b.id, true
from public.services as s
cross join public.branches as b
where s.id::text like 'a1300000-%'
on conflict (service_id, branch_id) do nothing;

-- ============================================================
-- 2. Golden Package - one row per branch, bundling the same three
-- Grooming services
-- ============================================================

insert into public.packages (branch_id, name, bundled_price)
select b.id, 'Golden Package', 600.00
from public.branches as b
where not exists (
  select 1 from public.packages as p
  where p.branch_id = b.id and p.name = 'Golden Package'
);

insert into public.package_services (package_id, service_id)
select p.id, s.service_id
from public.packages as p
cross join (
  values
    ('a1300000-0000-4000-a000-000000000001'::uuid),  -- Bath (shampoo)
    ('a1300000-0000-4000-a000-000000000002'::uuid),  -- Blow-dry
    ('a1300000-0000-4000-a000-000000000003'::uuid)   -- Brushing
) as s(service_id)
where p.name = 'Golden Package'
on conflict (package_id, service_id) do nothing;

-- ============================================================
-- 3. Mandated discounts: Senior Citizen 20% and PWD 20%, inactive by
-- default (#43 AC-2 / #44 AC-3)
--
-- SCOPE DECISION (flagged, not a silent guess - see this folder's .md):
-- the Guide's draft said "one row per branch" with scope_type = 'category'
-- but named no category, and the schema's CHECK requires exactly one
-- concrete scope per row. Since RA 9994/RA 10754 apply SC/PWD discounts
-- across all offerings, this seeds one row per type x branch x category
-- (2 x 2 x 4 = 16 rows) so toggling 'Senior Citizen - Veterinary' on at
-- Makati is independent per category and branch, exactly the MA29
-- concern. If the client instead wants a single all-categories switch per
-- branch, delete the extra rows or add an 'all' scope value - revisit at
-- sprint task 2-A confirmation.
-- ============================================================

insert into public.discounts
  (branch_id, name, is_mandated, discount_type, value, scope_type, scope_category, is_active)
select
  b.id,
  d.name,
  true,
  'Percentage',
  20.00,
  'category',
  cat.category,
  false
from public.branches as b
cross join (
  values ('Senior Citizen Discount'), ('PWD Discount')
) as d(name)
cross join (
  values
    ('Grooming'::public.service_category),
    ('Hotel'::public.service_category),
    ('Daycare'::public.service_category),
    ('Veterinary'::public.service_category)
) as cat(category)
where not exists (
  select 1 from public.discounts as existing
  where existing.branch_id = b.id
    and existing.name = d.name
    and existing.scope_category = cat.category
);
