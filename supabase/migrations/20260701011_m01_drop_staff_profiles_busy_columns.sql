alter table public.staff_profiles
  drop column if exists is_busy,
  drop column if exists busy_until;
