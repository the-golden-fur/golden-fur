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
--   2. packages / package_services / package_branch_availability - the
--      Golden Package (Shampoo/Bath, Blow-dry, Brushing), one shared row
--      available at every branch (custom change: packages moved off the
--      old MA22 one-row-per-branch model onto a many-to-many join, mirroring
--      service_branch_availability - see migration
--      20260818134_custom_package_branch_availability.sql). No bundled_price
--      here - Epic B (#82/#83, migration
--      20260726048_m13_package_pricing_configuration.sql) dropped that
--      column; the price is now derived on read from the included
--      services' base_price and the shared package_pricing_configuration
--      discount percentage.
--   3. discounts / discount_branch_availability - Senior Citizen + PWD, one
--      row per category (2 types x 4 categories = 8 rows), each available at
--      every branch, inactive by default. Custom change: discounts moved off
--      a single branch_id column onto the same many-to-many
--      *_branch_availability join used by services/packages (see migration
--      20260820140_custom_discount_branch_availability.sql) - down from the
--      original 16 branch x type x category rows, since one discount row can
--      now span every branch and still be toggled off per-branch via
--      discount_branch_availability.is_available.
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
-- 2. Golden Package - one shared row, available at every branch, bundling
-- the same three Grooming services
-- ============================================================

insert into public.packages (name, use_pricing_matrix)
select 'Golden Package', true
where not exists (
  select 1 from public.packages where name = 'Golden Package'
);

insert into public.package_branch_availability (package_id, branch_id, is_available)
select p.id, b.id, true
from public.packages as p
cross join public.branches as b
where p.name = 'Golden Package'
on conflict (package_id, branch_id) do nothing;

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
-- 3. Mandated discounts: Senior Citizen 20% and PWD 20%
--
-- SCOPE DECISION (flagged, not a silent guess - see this folder's .md):
-- the Guide's draft said "one row per branch" with scope_type = 'category'
-- but named no category, and the schema's CHECK requires exactly one
-- concrete scope per row. Since RA 9994/RA 10754 apply SC/PWD discounts
-- across all offerings, this seeds one row per type x category (2 x 4 = 8
-- rows), each available at every branch via discount_branch_availability -
-- 'Senior Citizen - Veterinary' still toggles independently at Makati vs
-- Southwoods (the original MA29 concern), just through the availability
-- table's per-branch is_available flag instead of a duplicate discount row.
-- If the client instead wants a single all-categories switch, delete the
-- extra rows or add an 'all' scope value - revisit at sprint task 2-A
-- confirmation.
--
-- Custom change (unify active/available): is_active is derived from branch
-- availability everywhere now (discounts.service.ts keeps it in sync on
-- every write) - since every row here is seeded available at every branch,
-- it is seeded active too, no separate manual activation step.
-- ============================================================

insert into public.discounts
  (name, is_mandated, discount_type, value, scope_type, scope_category, is_active)
select
  d.name,
  true,
  'Percentage',
  20.00,
  'category',
  cat.category,
  true
from (
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
  where existing.name = d.name
    and existing.scope_category = cat.category
);

insert into public.discount_branch_availability (discount_id, branch_id, is_available)
select disc.id, b.id, true
from public.discounts as disc
cross join public.branches as b
where disc.is_mandated
  and disc.name in ('Senior Citizen Discount', 'PWD Discount')
on conflict (discount_id, branch_id) do nothing;
