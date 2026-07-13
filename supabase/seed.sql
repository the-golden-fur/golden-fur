-- Golden Fur local/remote seed data - branches only.
-- Runs after all migrations on `supabase db reset` (see supabase/config.toml
-- [db.seed] sql_paths).
--
-- Staff and customer accounts are seeded separately via
-- supabase/seeds/seedStaffAndCustomers.ts (run manually with
-- `npm --prefix supabase run seed:staff-customers`), since staff_profiles
-- and customer_profiles rows have a 1:1 foreign key to auth.users, which the
-- Supabase Admin API must populate - a plain INSERT here can't create a
-- matching auth.users row on a hosted project.
--
-- Safe to re-run: ON CONFLICT (name) DO NOTHING means an existing branches
-- row (e.g. from Pre-epic Issue #2) is left untouched.

insert into public.branches (
  name,
  address,
  contact_number,
  is_vet_branch,
  operating_hours,
  timezone
)
values
  (
    'Makati',
    'Makati City, Philippines',
    '+63 2 8888 0001',
    true,
    '{"monday":{"open":"08:00","close":"18:00"},"tuesday":{"open":"08:00","close":"18:00"},"wednesday":{"open":"08:00","close":"18:00"},"thursday":{"open":"08:00","close":"18:00"},"friday":{"open":"08:00","close":"18:00"},"saturday":{"open":"09:00","close":"15:00"},"sunday":{"open":"10:00","close":"14:00"}}'::jsonb,
    'Asia/Manila'
  ),
  (
    'Southwoods',
    'Southwoods City, Philippines',
    '+63 46 8888 0002',
    false,
    '{"monday":{"open":"08:00","close":"17:00"},"tuesday":{"open":"08:00","close":"17:00"},"wednesday":{"open":"08:00","close":"17:00"},"thursday":{"open":"08:00","close":"17:00"},"friday":{"open":"08:00","close":"17:00"},"saturday":{"open":"09:00","close":"14:00"},"sunday":{"open":"10:00","close":"13:00"}}'::jsonb,
    'Asia/Manila'
  )
on conflict (name) do nothing;
