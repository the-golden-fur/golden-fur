-- M12 Discount Management - the statutory Senior Citizen / PWD discount rows
-- (Issue #44, AC-3).
--
-- Pure-SQL alternative to m12-discounts.seed.ts. Self-contained - every
-- insert below is plain SQL.
--
-- Seeds discounts / discount_branch_availability - Senior Citizen + PWD, one
-- row per category (2 types x 4 categories = 8 rows), each available at
-- every branch. Custom change: discounts moved off a single branch_id column
-- onto the many-to-many *_branch_availability join used by services/packages
-- (see migration 20260820140_custom_discount_branch_availability.sql) - down
-- from the original 16 branch x type x category rows, since one discount row
-- can now span every branch and still be toggled off per-branch via
-- discount_branch_availability.is_available.
--
-- SCOPE DECISION (flagged, not a silent guess): the Guide's draft said "one
-- row per branch" with scope_type = 'category' but named no category, and
-- the schema's CHECK requires exactly one concrete scope per row. Since
-- RA 9994 / RA 10754 apply SC/PWD discounts across all offerings, this seeds
-- one row per type x category (2 x 4 = 8 rows), each available at every
-- branch via discount_branch_availability - 'Senior Citizen - Veterinary'
-- still toggles independently at Makati vs Southwoods, just through the
-- availability table's per-branch is_available flag instead of a duplicate
-- discount row. If the client instead wants a single all-categories switch,
-- delete the extra rows or add an 'all' scope value.
--
-- Custom change (unify active/available): is_active is derived from branch
-- availability everywhere now (discounts.service.ts keeps it in sync on
-- every write) - since every row here is seeded available at every branch,
-- it is seeded active too, no separate manual activation step.
--
-- Runs automatically on `supabase db reset` (see supabase/config.toml
-- [db.seed] sql_paths, ordered AFTER m01's seed so branches.id values
-- exist). Idempotent - guarded by NOT EXISTS / ON CONFLICT, safe to re-run.

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
