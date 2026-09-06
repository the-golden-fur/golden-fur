-- M13 Maintenance (Packages, Services & Promos) - branch-dependent reference
-- seed data (Issues #44, #40).
--
-- Pure-SQL alternative to m13-maintenance.seed.ts, for when you'd rather
-- paste this into the Supabase SQL Editor / run it via psql than a Node
-- script. Self-contained - every insert below is plain SQL.
--
-- Seeds the M13 pieces that need real branches.id values to exist
-- (migration 20260715034 seeds the branch-independent base service catalog
-- + pricing tiers; this file assumes those rows are already present):
--
--   1. service_branch_availability - every base service available at every
--      branch (#40's disable-a-branch-not-opt-in recommendation).
--   2. packages / package_services / package_branch_availability - the
--      Golden Package (Shampoo/Bath, Blow-dry, Brushing), one shared row
--      available at every branch (custom change: packages moved off the
--      old MA22 one-row-per-branch model onto a many-to-many join - see
--      migration 20260818134_custom_package_branch_availability.sql). No
--      bundled_price here - Epic B (#82/#83) dropped that column; the price
--      is derived on read from the included services' base_price and the
--      shared package_pricing_configuration discount percentage.
--   3. promos / promo_branch_availability - two always-on, all-services,
--      condition-based promos (no start/end date, so promoExpiry never
--      deactivates them), available at every branch.
--
-- The M12 Senior Citizen / PWD discount rows moved to
-- ../m12-discounts/m12-discounts.seed.sql when the seed folders were renamed
-- to match the Modules-Features module numbers.
--
-- Runs automatically on `supabase db reset` (see supabase/config.toml
-- [db.seed] sql_paths, ordered AFTER m01's seed so branches.id values
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
-- 3. Promos (+ promo_branch_availability) - two always-on, all-services
-- promos, available at every branch
-- ============================================================

insert into public.promos (name, discount_type, value, scope_type, condition_note, is_active)
select v.name, v.discount_type::public.discount_type, v.value, 'all_services', v.condition_note, true
from (
  values
    ('Loyalty Reward', 'Percentage', 10.00, 'Returning customer - 3rd visit onward'),
    ('Weekday Walk-in', 'Flat', 100.00, 'Walk-in booking, Monday to Thursday')
) as v(name, discount_type, value, condition_note)
where not exists (
  select 1 from public.promos as existing where existing.name = v.name
);

insert into public.promo_branch_availability (promo_id, branch_id, is_available)
select p.id, b.id, true
from public.promos as p
cross join public.branches as b
where p.name in ('Loyalty Reward', 'Weekday Walk-in')
  and not exists (
    select 1 from public.promo_branch_availability as existing
    where existing.promo_id = p.id and existing.branch_id = b.id
  );
