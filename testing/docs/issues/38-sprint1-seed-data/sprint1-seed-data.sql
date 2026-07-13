-- Issue #38 Verification SQL
-- Confirms supabase/seed.sql (branches) and
-- supabase/seeds/seedStaffAndCustomers.ts (staff/customers/pets) landed the
-- expected rows and left the excluded tables untouched (AC-5).
--
-- Note: the Supabase SQL Editor runs as the postgres role and bypasses RLS
-- entirely, so these counts reflect true table contents regardless of RLS
-- policy. Run this after `supabase/seed.sql` has been applied and
-- `npm --prefix supabase run seed:staff-customers` has been run at least
-- once.

-- ============================================================
-- 1. Branches (AC-1) - Makati and Southwoods exist
-- ============================================================

select name, is_vet_branch, timezone
from public.branches
where name in ('Makati', 'Southwoods')
order by name;
-- Expected: 2 rows, Makati (is_vet_branch = true), Southwoods (false)

-- ============================================================
-- 2. This script's 8 staff rows - one per role, split across branches
--    (AC-2). Distinguished from the older seed.sql-era rows by username
--    having no trailing "1"/"2".
-- ============================================================

select role, branch_id, username, registered_email
from public.staff_profiles
where username ~ '^(makati|southwoods)\.[a-z]+$'
order by role;
-- Expected: 8 rows, one per staff_role value, 4 under each branch_id

select count(*) as roles_covered
from (
  select distinct role
  from public.staff_profiles
  where username ~ '^(makati|southwoods)\.[a-z]+$'
) distinct_roles;
-- Expected: 8

-- ============================================================
-- 3. This script's 3 customers + their pets (AC-3), varied
--    species/weight_class/coat_type
-- ============================================================

select
  cp.account_email,
  cp.facebook_id,
  p.name as pet_name,
  p.species,
  p.weight_class,
  p.coat_type
from public.customer_profiles cp
join public.pets p on p.customer_id = cp.id
where cp.account_email in (
  'customer7@goldenfur.com',
  'customer8@goldenfur.com',
  'customer9@goldenfur.com'
)
order by cp.account_email, p.name;
-- Expected: 5 rows total (2 + 1 + 2 pets), spanning both species, at least
-- 2 distinct weight_class values, and both coat_type values

-- ============================================================
-- 4. Exactly one seed customer has a facebook_id (AC-4)
-- ============================================================

select account_email, facebook_id
from public.customer_profiles
where facebook_id is not null;
-- Expected: at least customer9@goldenfur.com with
-- facebook_id = 'fb_seed_placeholder_0001'

-- ============================================================
-- 5. Excluded tables remain empty of seed-originated rows (AC-5)
-- ============================================================

select count(*) as unavailability_block_rows
from public.staff_unavailability_blocks;
-- Expected: 0 (this table should only gain rows from manual QA via the
-- Epic B #29/#30 request/approval workflow, never from seeding)

select count(*) as vaccination_record_rows
from public.pet_vaccination_records
where pet_id in (
  select id from public.pets
  where customer_id in (
    select id from public.customer_profiles
    where account_email in (
      'customer7@goldenfur.com', 'customer8@goldenfur.com', 'customer9@goldenfur.com'
    )
  )
);
-- Expected: 0

select count(*) as medical_note_rows
from public.pet_medical_notes
where pet_id in (
  select id from public.pets
  where customer_id in (
    select id from public.customer_profiles
    where account_email in (
      'customer7@goldenfur.com', 'customer8@goldenfur.com', 'customer9@goldenfur.com'
    )
  )
);
-- Expected: 0
