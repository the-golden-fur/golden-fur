-- The kg cut-offs that turn a pet's recorded weight_kg into an S/M/L/XL
-- weight_class. Client interview: these bands are a business rule the client
-- wants Admin/Superadmin to own and tune, not a constant baked into the code.
--
-- Same singleton pattern as pricing_configuration (...047) and
-- package_pricing_configuration (...048): one row, enforced by a
-- unique-on-(true) index, seeded here from the migration (no supabase/seeds
-- trio - matching those two tables), edited in place, never deleted. No
-- branch_id: a 22 kg dog is a 22 kg dog at every branch.
--
-- Bands (lower bound inclusive):
--   S:  weight_kg <  m_min_kg
--   M:  m_min_kg  <= weight_kg < l_min_kg
--   L:  l_min_kg  <= weight_kg < xl_min_kg
--   XL: weight_kg >= xl_min_kg
--
-- Seeded starting values (9.5 / 22 / 41) are a deliberate, non-round starting
-- point for the client to review - not a confirmed rule.

create table public.pet_weight_class_configuration (
  id uuid primary key default gen_random_uuid(),
  m_min_kg numeric(5, 2) not null default 9.50,
  l_min_kg numeric(5, 2) not null default 22.00,
  xl_min_kg numeric(5, 2) not null default 41.00,
  -- Nullable for the same reason as pricing_configuration.updated_by_staff_id:
  -- the seed row is written by this migration, which has no requester.
  updated_by_staff_id uuid references public.staff_profiles(id),
  updated_at timestamptz not null default now(),
  constraint pet_weight_class_configuration_ordered_check
    check (m_min_kg > 0 and m_min_kg < l_min_kg and l_min_kg < xl_min_kg)
);

create unique index pet_weight_class_configuration_singleton_uniq
  on public.pet_weight_class_configuration((true));

insert into public.pet_weight_class_configuration default values;

comment on table public.pet_weight_class_configuration is
  'Singleton (Admin/Superadmin editable): the kg cut-offs that derive a '
  'pet''s S/M/L/XL weight_class from its recorded weight_kg. Lower bound '
  'inclusive. Seeded values are a starting point for client review.';

-- RLS - same two-tier shape as pricing_configuration: all authenticated staff
-- read (the assessment modal and pet forms resolve the derived class at
-- request time), only Admin/Superadmin write. No DELETE policy.

alter table public.pet_weight_class_configuration enable row level security;

create policy "Staff can read pet weight class configuration"
  on public.pet_weight_class_configuration
  for select
  to authenticated
  using (public.current_staff_role() is not null);

create policy "Admins and superadmins can manage pet weight class configuration"
  on public.pet_weight_class_configuration
  for all
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'))
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));
