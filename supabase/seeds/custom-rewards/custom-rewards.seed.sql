-- Custom change (coupon spin wheel + weekly-recurring promos, session 86).
--
-- Pure-SQL alternative to custom-rewards.seed.ts, for when you'd rather
-- paste this into the Supabase SQL Editor / run it via psql than a Node
-- script. Self-contained - every insert below is plain SQL.
--
-- spin_wheel_config's own thresholds are NOT seeded here - that singleton
-- settings row is written directly by migration 20260913196 itself (a real
-- column DEFAULT + `insert ... default values`), the same way
-- promo_cap_configuration/pricing_configuration already do. This file only
-- seeds actual per-row reference data:
--
--   1. spin_wheel_rewards - a 5-tier starter catalog whose rarity
--      percentages sum to exactly 100 (all-or-nothing: only inserts when the
--      table is currently empty, so a partial re-run never risks landing on
--      a sum that isn't 100).
--   2. promos / promo_branch_availability - one demo weekly_recurring promo
--      ("Midweek Discount", every Tuesday/Wednesday), available at every
--      branch.
--
-- Not part of one of the original M01-M14 modules, so this folder
-- deliberately has no `mNN-` prefix - mirrors how out-of-module migrations
-- use a `custom_` prefix instead of `mNN_`.
--
-- Runs automatically on `supabase db reset` (see supabase/config.toml
-- [db.seed] sql_paths, ordered after m01's seed so branches.id values
-- exist). Idempotent - guarded by NOT EXISTS throughout, safe to re-run
-- against a database that already has these rows.

-- ============================================================
-- 1. spin_wheel_rewards - 5-tier starter catalog (all-or-nothing)
-- ============================================================

insert into public.spin_wheel_rewards (label, discount_type, value, rarity_percent, is_active)
select v.label, v.discount_type::public.discount_type, v.value, v.rarity_percent, true
from (
  values
    ('5% off your next booking', 'Percentage', 5.00, 40.00),
    ('10% off your next booking', 'Percentage', 10.00, 30.00),
    ('15% off your next booking', 'Percentage', 15.00, 15.00),
    ('PHP 100 off', 'Flat', 100.00, 10.00),
    ('PHP 250 off', 'Flat', 250.00, 5.00)
) as v(label, discount_type, value, rarity_percent)
where not exists (select 1 from public.spin_wheel_rewards);

-- ============================================================
-- 2. Demo weekly-recurring promo (+ promo_branch_availability)
-- ============================================================

insert into public.promos (name, promo_type, days_of_week, discount_type, value, scope_type, is_active)
select 'Midweek Discount', 'weekly_recurring'::public.promo_type, array[2, 3], 'Percentage'::public.discount_type, 10.00, 'all_services', true
where not exists (
  select 1 from public.promos where name = 'Midweek Discount'
);

insert into public.promo_branch_availability (promo_id, branch_id, is_available)
select p.id, b.id, true
from public.promos as p
cross join public.branches as b
where p.name = 'Midweek Discount'
  and not exists (
    select 1 from public.promo_branch_availability as existing
    where existing.promo_id = p.id and existing.branch_id = b.id
  );
