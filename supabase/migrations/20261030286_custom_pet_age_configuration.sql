-- Custom change (pet age limit): the oldest a pet may be when it is
-- registered, so a typo'd date of birth (e.g. 1925 instead of 2025) can't
-- create a 100-year-old dog. Admin/Superadmin tune it from Settings > Config
-- > Pets > Age Limit.
--
-- Same singleton pattern as pet_weight_class_configuration (...186): one row,
-- enforced by a unique-on-(true) index, seeded here (no supabase/seeds trio),
-- edited in place, never deleted. No branch_id: a pet's age is the same at
-- every branch.
--
-- 38 years is the hard ceiling - the record for the oldest pet ever (Creme
-- Puff, a cat, 38 years). Admins can lower the limit but never raise it past
-- that; the CHECK below is the backstop for the same rule in
-- maintenance.validator.ts and pet.validator.ts.

create table public.pet_age_configuration (
  id uuid primary key default gen_random_uuid(),
  max_age_years integer not null default 38,
  -- Nullable for the same reason as pet_weight_class_configuration's: the
  -- seed row is written by this migration, which has no requester.
  updated_by_staff_id uuid references public.staff_profiles(id),
  updated_at timestamptz not null default now(),
  constraint pet_age_configuration_max_age_years_check
    check (max_age_years between 1 and 38)
);

create unique index pet_age_configuration_singleton_uniq
  on public.pet_age_configuration((true));

insert into public.pet_age_configuration default values;

comment on table public.pet_age_configuration is
  'Singleton (Admin/Superadmin editable): the oldest age, in years, a pet''s '
  'date of birth may imply when it is registered. Capped at 38 (the oldest '
  'pet on record).';

-- RLS - any signed-in user reads (customers adding their own pet need the
-- limit for the form), only Admin/Superadmin write. No DELETE policy.

alter table public.pet_age_configuration enable row level security;

create policy "Authenticated users can read pet age configuration"
  on public.pet_age_configuration
  for select
  to authenticated
  using (true);

create policy "Admins and superadmins can manage pet age configuration"
  on public.pet_age_configuration
  for all
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'))
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));

create trigger trg_archive_deleted_row
  after delete on public.pet_age_configuration
  for each row execute function public.archive_deleted_row();
